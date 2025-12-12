const detectWorkerCount = () => {
  const envValue = Number(import.meta.env?.VITE_LAYER_MESH_WORKER_CONCURRENCY)
  if (Number.isFinite(envValue) && envValue >= 1) return Math.floor(envValue)
  const cores = typeof navigator !== 'undefined' ? Number(navigator.hardwareConcurrency) : NaN
  if (Number.isFinite(cores) && cores > 0) {
    return Math.max(1, Math.min(4, Math.floor(cores / 2)))
  }
  return 1
}

const createWorkerInstance = () =>
  new Worker(new URL('../../workers/layerMesh.worker.js', import.meta.url), { type: 'module' })

const workerPool = []
const jobQueue = []
let jobSeq = 0

const assignJobs = () => {
  for (const instance of workerPool) {
    if (instance.busy) continue
    const job = jobQueue.shift()
    if (!job) break
    instance.busy = true
    instance.currentJob = job
    instance.worker.postMessage({
      jobId: job.id,
      action: job.action,
      payload: job.payload,
    })
  }
}

const handleWorkerMessage = (instance, event) => {
  const { jobId, success, result, error } = event.data || {}
  const job = instance.currentJob
  if (!job || job.id !== jobId) return
  instance.busy = false
  instance.currentJob = null
  if (success) job.resolve(result)
  else job.reject(error ? new Error(error) : new Error('layer mesh worker failed'))
  assignJobs()
}

const handleWorkerError = (instance, event) => {
  const job = instance.currentJob
  instance.busy = false
  instance.currentJob = null
  if (job) {
    job.reject(event?.error || new Error(event?.message || 'layer mesh worker error'))
  }
  try {
    instance.worker.terminate()
  } catch {
    // ignore terminate errors
  }
  const index = workerPool.indexOf(instance)
  if (index >= 0) workerPool.splice(index, 1)
  spawnWorker()
  assignJobs()
}

const spawnWorker = () => {
  try {
    const worker = createWorkerInstance()
    const instance = {
      worker,
      busy: false,
      currentJob: null,
    }
    worker.onmessage = (event) => handleWorkerMessage(instance, event)
    worker.onerror = (event) => handleWorkerError(instance, event)
    workerPool.push(instance)
  } catch (error) {
    console.error('[layer-mesh] failed to spawn worker', error)
  }
}

const ensurePool = () => {
  if (workerPool.length > 0) return
  const target = detectWorkerCount()
  for (let i = 0; i < target; i += 1) {
    spawnWorker()
  }
}

export const enqueueLayerMeshJob = ({ action, payload }) => {
  ensurePool()
  const id = ++jobSeq
  return new Promise((resolve, reject) => {
    jobQueue.push({ id, action, payload, resolve, reject })
    assignJobs()
  })
}

export const terminateLayerMeshWorkers = () => {
  for (const instance of workerPool) {
    try {
      instance.worker.terminate()
    } catch {
      // ignore terminate errors
    }
  }
  workerPool.splice(0)
  jobQueue.splice(0)
}

