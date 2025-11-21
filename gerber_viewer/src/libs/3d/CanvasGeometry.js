import * as THREE from 'three';

export class CanvasGeometry extends THREE.BufferGeometry {
  constructor(canvas, options = {}) {
    super();
    if (!canvas || typeof canvas.getContext !== 'function') return;

    // === 1. 参数配置 ===
    const steps = options.steps !== undefined ? (parseInt(options.steps) > 0 ? parseInt(options.steps) : 1) : 1;
    let z = options.height !== undefined ? (options.height > 0 ? options.height : 0.1) : 0.1;
    const material = options.material || 0;
    const solid = options.solid !== undefined ? options.solid : true;
    const off = options.offset !== undefined ? options.offset % 4 : 3;
    const extrudeMaterial = options.extrudeMaterial || 1;

    // 侧面生成函数
    const ef = typeof (options.extrudeFunc) == "function" ? options.extrudeFunc :
      function (vs, fs, uvs, pa, pb, na, nb, nx, ny, step, steps, mtl) {
        fs.push({ a: pb, b: na, c: pa, materialIndex: mtl });
        fs.push({ a: nb, b: na, c: pb, materialIndex: mtl });
        uvs.push([new THREE.Vector2(0, 0), new THREE.Vector2(0, 0), new THREE.Vector2(0, 0)]);
        uvs.push([new THREE.Vector2(0, 0), new THREE.Vector2(0, 0), new THREE.Vector2(0, 0)]);
      };

    const ctx = canvas.getContext("2d", { willReadFrequently: true }); // 优化 canvas 读取性能
    
    // 中间数据容器
    // 提示：如果 Canvas 很大，这里会产生大量对象，建议调用前缩小 Canvas
    let vertices = [], faces = [], fUvs = [], side = [];
    
    // ... (此处保留你原始的变量声明) ...
    let running=0,n=0,ps,pe,pt=0,t,checked,pl=0,nl=0,parent,f,uv,fl,vl,ht,nv,pv,p;
    let i,j,c=0,width=canvas.width,height=canvas.height;
    
    // 安全检查：防止过大图片直接导致崩溃
    if(width > 1024 || height > 1024) {
        console.warn(`CanvasGeometry: Canvas 尺寸过大 (${width}x${height})，极易导致 Context Lost。建议缩小至 512px 以下。`);
    }

    const dt = ctx.getImageData(0,0,width,height);
    const yunit = 1/height;
    const xunit = 1/width;
    const data = dt.data;

    // ============================================
    // === 核心算法：Raster 扫描与轮廓提取 (保持原样) ===
    // ============================================
    for(i=0; i < height; i++){
      ps=pt; pe=n; pt=0; parent=0; j=0; c=4*(i*width+j);
      data[c+4*width-1]=0;
      nv = 1 - i/height;
      pv = 1 - ((i-1)/height);
      ht = (height-i)*xunit;
      for(; j < width;j++, c += 4){
        if(data[c+off]){
          if(!running){
            vertices.push({ x: (j+(1-data[c+3]/256))/width, y: ht, z: z });
            if(!pt) pt=n+1;
            running=1;
          }
        } else if(running) {
          vertices.push({ x: (j-(1-data[c-1]/256))/width, y: ht, z: z });
          if(ps){
            checked=0;
            for(t=ps;t < pe;t+=2){
              if(vertices[t].x <= vertices[n].x-xunit){
                ps = t+2;
                if(parent < t && vertices[t-1].z > 0){
                  side.push([t,t-1,0,-1]);
                }
                if(vertices[t].z<0){
                  side.push([t+1,t,0,-1]);
                  vertices[t].z = -vertices[t].z;
                }
                continue;
              }
              if(vertices[t-1].x <= vertices[n+1].x+xunit){
                if(vertices[t-1].z < 0){
                  side.push([t-1,t,0,1]);
                  vertices[t-1].z=-vertices[t-1].z;
                }
                if(!checked){
                  if(parent == t){
                    faces.push({ a: t, b: n-1, c: n, materialIndex: material });
                    fUvs.push([
                      new THREE.Vector2(vertices[t].x,pv),
                      new THREE.Vector2(vertices[n-1].x,nv),
                      new THREE.Vector2(vertices[n].x,nv)
                    ]);
                    if(vertices[n-1].z > 0) vertices[n-1].z=-vertices[n-1].z;
                    pl=0;
                  } else {
                    if(pl){
                      side.push([pl,nl,yunit,vertices[nl].x-vertices[pl].x]);
                      pl=0;
                    }
                    side.push([n,t-1,-yunit,vertices[t-1].x-vertices[n].x]);
                    faces.push({ a: t, b: t-1, c: n, materialIndex: material });
                    fUvs.push([
                      new THREE.Vector2(vertices[t].x,pv),
                      new THREE.Vector2(vertices[t-1].x,pv),
                      new THREE.Vector2(vertices[n].x,nv)
                    ]);
                  }
                  faces.push({ a: t, b: n, c: n+1, materialIndex: material });
                  fUvs.push([
                    new THREE.Vector2(vertices[t].x,pv),
                    new THREE.Vector2(vertices[n].x,nv),
                    new THREE.Vector2(vertices[n+1].x,nv)
                  ]);
                  checked=1;
                } else {
                  faces.push({ a: t-1, b: t-2, c: n+1, materialIndex: material });
                  fUvs.push([
                    new THREE.Vector2(vertices[t-1].x,pv),
                    new THREE.Vector2(vertices[t-2].x,pv),
                    new THREE.Vector2(vertices[n+1].x,nv)
                  ]);
                  if(vertices[t-2].z > 0){
                    side.push([t-2,t-1,0,1]);
                  } else {
                    vertices[t-2].z=-vertices[t-2].z;
                  }
                  faces.push({ a: t, b: t-1, c: n+1, materialIndex: material });
                  fUvs.push([
                    new THREE.Vector2(vertices[t].x,pv),
                    new THREE.Vector2(vertices[t-1].x,pv),
                    new THREE.Vector2(vertices[n+1].x,nv)
                  ]);
                }
                parent=t;
              }
            }
          }
          if(checked){
            pl=parent;
            nl=n+1;
          } else {
            vertices[n].z=-vertices[n].z;
          }
          n+=2;
          running=0;
        }
      }
      if(pl){
        side.push([pl,nl,yunit,vertices[nl].x-vertices[pl].x]);
        pl=0;
      }
      if(ps){
        for(;ps < pe;ps+=2){
          if(parent < ps && vertices[ps-1].z > 0){
            side.push([ps,ps-1,0,-1]);
          }
          if(vertices[ps].z < 0){
            side.push([ps+1,ps,0,-1]);
            vertices[ps].z=-vertices[ps].z;
          }
        }
      }
    }

    if(pt){
      for(;pt < n;pt+=2){
        if(vertices[pt-1].z > 0){
          side.push([pt,pt-1,0,-1]);
        }
        if(vertices[pt].z < 0){
          side.push([pt+1,pt,0,-1]);
          vertices[pt].z=-vertices[pt].z;
        }
      }
    }

    if(solid){
      vl=vertices.length; fl=faces.length; ht = z/steps;
      for(j=0;j!=steps;j++){
        z -= ht;
        for(i=0;i!=vl;i++){
          vertices.push({ x: vertices[i].x, y: vertices[i].y, z: z });
        }
      }
      pe=steps*vl;
      for(i=0;i!=fl;i++){
        f=faces[i];
        faces.push({ a: f.c+pe, b: f.b+pe, c: f.a+pe, materialIndex: ( (f.materialIndex||0) + 1 ) });
        uv = fUvs[i];
        fUvs.push([ uv[2].clone ? uv[2].clone() : uv[2], uv[1].clone ? uv[1].clone() : uv[1], uv[0].clone ? uv[0].clone() : uv[0] ]);
      }
      ps = 0; pe = vl;
      for(j=0;j!=steps;j++){
        for(i=0;i!=side.length;i++){
          p=side[i];
          ef(vertices,faces,fUvs,p[0]+ps,p[1]+ps,p[0]+pe,p[1]+pe,p[2],p[3],j+1,steps,extrudeMaterial);
        }
        ps += vl;
        pe += vl;
      }
    }

    // ============================================================
    // === 优化部分：构建 BufferGeometry (解决 Context Lost) ===
    // ============================================================
    
    const faceCount = faces.length;
    if (faceCount === 0) {
      this.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      return;
    }

    // 【关键优化 1】: 先按 MaterialIndex 排序
    // 原代码是交错 push 的，这会导致 DrawCalls 爆炸。
    // 我们创建一个索引数组来排序，避免直接移动大对象。
    const indices = new Uint32Array(faceCount);
    for (let k = 0; k < faceCount; k++) indices[k] = k;

    indices.sort((a, b) => {
      const ma = faces[a].materialIndex || 0;
      const mb = faces[b].materialIndex || 0;
      return ma - mb;
    });

    const positions = new Float32Array(faceCount * 9); // 3 verts * 3 coords
    const uvsArray = new Float32Array(faceCount * 6);   // 3 verts * 2 coords

    let currentMat = faces[indices[0]].materialIndex || 0;
    let groupStart = 0;

    for (let i = 0; i < faceCount; i++) {
      // 使用排序后的索引访问
      const originalIndex = indices[i];
      const face = faces[originalIndex];
      const uvNodes = fUvs[originalIndex]; // 修正：这里应该是 uvNodes 数组

      // 填充 Position
      const va = vertices[face.a];
      const vb = vertices[face.b];
      const vc = vertices[face.c];
      
      const pOff = i * 9;
      positions[pOff + 0] = va.x; positions[pOff + 1] = va.y; positions[pOff + 2] = va.z;
      positions[pOff + 3] = vb.x; positions[pOff + 4] = vb.y; positions[pOff + 5] = vb.z;
      positions[pOff + 6] = vc.x; positions[pOff + 7] = vc.y; positions[pOff + 8] = vc.z;

      // 填充 UV (增加容错)
      const u0 = (uvNodes && uvNodes[0]) ? uvNodes[0] : {x:0, y:0};
      const u1 = (uvNodes && uvNodes[1]) ? uvNodes[1] : {x:0, y:0};
      const u2 = (uvNodes && uvNodes[2]) ? uvNodes[2] : {x:0, y:0};

      const uOff = i * 6;
      uvsArray[uOff + 0] = u0.x; uvsArray[uOff + 1] = u0.y;
      uvsArray[uOff + 2] = u1.x; uvsArray[uOff + 3] = u1.y;
      uvsArray[uOff + 4] = u2.x; uvsArray[uOff + 5] = u2.y;

      // 检查材质是否变化（因为已排序，所以只会变化几次，极大减少 Group 数量）
      const mat = face.materialIndex || 0;
      if (mat !== currentMat) {
        this.addGroup(groupStart * 3, (i - groupStart) * 3, currentMat);
        groupStart = i;
        currentMat = mat;
      }
    }
    
    // 添加最后一个 Group
    this.addGroup(groupStart * 3, (faceCount - groupStart) * 3, currentMat);

    this.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.setAttribute('uv', new THREE.BufferAttribute(uvsArray, 2));
    this.computeVertexNormals();

    // 元数据
    this.userdata = { trace: side };

    // 【关键优化 2】: 释放中间内存
    // 这些巨大的数组如果不释放，在生成下一个 Geometry 时会导致内存峰值，引发 Crash
    vertices = null;
    faces = null;
    fUvs = null;
    side = null;
  }
}