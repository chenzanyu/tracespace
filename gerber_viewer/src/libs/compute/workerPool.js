const DEFAULT_MAX_CONCURRENCY = 4

export const detectComputeWorkerConcurrency = () => {
  const envValue = Number(import.meta.env?.VITE_COMPUTE_WORKER_CONCURRENCY)
  if (Number.isFinite(envValue) && envValue >= 1) return Math.floor(envValue)
  const navCores = typeof navigator !== 'undefined' ? Number(navigator.hardwareConcurrency) : NaN
  if (Number.isFinite(navCores) && navCores > 0) {
    return Math.max(1, Math.min(DEFAULT_MAX_CONCURRENCY, Math.floor(navCores / 2)))
  }
  return 2
}

const createWorkerInstance = () =>
  new Worker(new URL('../../workers/compute.worker.js', import.meta.url), { type: 'module' })

export class ComputeWorkerPool {
  constructor({ concurrency = detectComputeWorkerConcurrency() } = {}) {
    this.concurrency = Math.max(1, Math.floor(concurrency || 1))
    this.instances = []
    this.jobSeq = 0
    this.activeJobs = new Map()
    this._ensurePool()
  }

  _ensurePool() {
    if (this.instances.length > 0) return
    for (let i = 0; i < this.concurrency; i += 1) {
      this._spawnWorker(i)
    }
  }

  _spawnWorker(index) {
    const worker = createWorkerInstance()
    const instance = {
      index,
      worker,
      busy: false,
      currentJobId: null,
      queue: [],
    }
    worker.onmessage = (event) => this._handleMessage(instance, event)
    worker.onerror = (event) => this._handleError(instance, event)
    this.instances.push(instance)
    return instance
  }

  _handleMessage(instance, event) {
    const { jobId, success, result, error, message } = event.data || {}
    if (jobId) {
      const job = this.activeJobs.get(jobId)
      if (job) {
        this.activeJobs.delete(jobId)
        if (success) job.resolve(result)
        else job.reject(new Error(error || message || 'worker error'))
      }
    }
    instance.busy = false
    instance.currentJobId = null
    this._assignNext(instance)
  }

  _handleError(instance, event) {
    const details = event?.message || event?.error?.message || 'compute worker error'
    const failedJobId = instance.currentJobId
    if (failedJobId && this.activeJobs.has(failedJobId)) {
      const job = this.activeJobs.get(failedJobId)
      this.activeJobs.delete(failedJobId)
      job.reject(new Error(details))
    }
    try {
      instance.worker.terminate()
    } catch {
      // ignore terminate errors
    }
    const idx = this.instances.indexOf(instance)
    if (idx >= 0) this.instances.splice(idx, 1)
    this._spawnWorker(instance.index)
  }

  _assignNext(instance) {
    if (instance.busy) return
    const next = instance.queue.shift()
    if (!next) return
    instance.busy = true
    instance.currentJobId = next.jobId
    try {
      instance.worker.postMessage(
        { jobId: next.jobId, action: next.action, payload: next.payload },
        next.transfer || []
      )
    } catch (error) {
      instance.busy = false
      instance.currentJobId = null
      this.activeJobs.delete(next.jobId)
      next.reject(error)
      this._assignNext(instance)
    }
  }

  _enqueueToInstance(instance, { action, payload, transfer = [], priority = 0 }) {
    const jobId = ++this.jobSeq
    return new Promise((resolve, reject) => {
      const job = { jobId, action, payload, transfer, resolve, reject, priority }
      this.activeJobs.set(jobId, job)
      const queue = instance.queue
      if (queue.length === 0 || priority <= 0) {
        queue.push(job)
      } else {
        const insertAt = queue.findIndex((entry) => (entry.priority || 0) < priority)
        if (insertAt === -1) queue.push(job)
        else queue.splice(insertAt, 0, job)
      }
      this._assignNext(instance)
    })
  }

  enqueue({ action, payload, transfer = [], workerIndex = 0, priority = 0 }) {
    this._ensurePool()
    const index = Math.max(0, Math.min(this.instances.length - 1, workerIndex))
    return this._enqueueToInstance(this.instances[index], { action, payload, transfer, priority })
  }

  broadcast({ action, payload, priority = 0 }) {
    this._ensurePool()
    return Promise.all(
      this.instances.map((instance) =>
        this._enqueueToInstance(instance, { action, payload, transfer: [], priority })
      )
    )
  }

  cancelAll(reason = 'compute job cancelled') {
    const error = reason instanceof Error ? reason : new Error(String(reason || 'compute job cancelled'))
    for (const instance of this.instances) {
      const queued = Array.isArray(instance.queue) ? instance.queue.splice(0) : []
      for (const job of queued) {
        if (!job?.jobId) continue
        this.activeJobs.delete(job.jobId)
        try {
          job.reject(error)
        } catch {
          // ignore rejection failures
        }
      }
      const busyJobId = instance.currentJobId
      if (busyJobId && this.activeJobs.has(busyJobId)) {
        const job = this.activeJobs.get(busyJobId)
        this.activeJobs.delete(busyJobId)
        try {
          job.reject(error)
        } catch {
          // ignore rejection failures
        }
      }
    }
  }

  terminate() {
    for (const job of this.activeJobs.values()) {
      try {
        job.reject(new Error('compute worker terminated'))
      } catch {
        // ignore rejection failures
      }
    }
    for (const instance of this.instances) {
      instance.queue.splice(0)
      try {
        instance.worker.terminate()
      } catch {
        // ignore terminate errors
      }
    }
    this.instances.splice(0)
    this.activeJobs.clear()
  }
}
