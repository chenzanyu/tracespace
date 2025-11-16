import * as THREE from 'three';

/**
 * CanvasGeometry (pure JS)
 * - 保留原始 raster -> contour -> extrude 算法（未改逻辑）
 * - 输出的是 **非索引 BufferGeometry**（每个 face 的 3 顶点独立），
 *   这样可以为每个 face 顶点分配独立的 UV（精确还原颜色贴图）
 */
export class CanvasGeometry extends THREE.BufferGeometry {
  constructor(canvas, options = {}) {
    super();
    if (!canvas || typeof canvas.getContext !== 'function') return;

    const steps = options.steps !== undefined ? (parseInt(options.steps) > 0 ? parseInt(options.steps) : 1)  : 1;
    let z = options.height !== undefined ? (options.height > 0 ? options.height:0.1) : 0.1;
    const material = options.material || 0;
    const solid = options.solid !== undefined ? options.solid:true;
    const off = options.offset !== undefined ? options.offset % 4 : 3;
    const extrudeMaterial = options.extrudeMaterial || 1;

    // sidewall face generator (pushes faces with materialIndex)
    const ef = typeof(options.extrudeFunc) == "function" ? options.extrudeFunc : 
      function(vs,fs,uvs,pa,pb,na,nb,nx,ny,step,steps,mtl){
        fs.push({ a: pb, b: na, c: pa, materialIndex: mtl });
        fs.push({ a: nb, b: na, c: pb, materialIndex: mtl });
        uvs.push([ new THREE.Vector2(0,0), new THREE.Vector2(0,0), new THREE.Vector2(0,0) ]);
        uvs.push([ new THREE.Vector2(0,0), new THREE.Vector2(0,0), new THREE.Vector2(0,0) ]);
      };

    const ctx = canvas.getContext("2d");
    // arrays used by original algorithm
    const vertices = [], faces = [], fUvs = [], side = [];
    let running=0,n=0,ps,pe,pt=0,t,checked,pl=0,nl=0,parent,f,uvs,fl,vl,ht,nv,pv,p;
    let i,j,c=0,width=canvas.width,height=canvas.height;
    const dt = ctx.getImageData(0,0,width,height);
    const yunit = 1/height;
    const xunit = 1/width;
    const data = dt.data;

    // === 原算法（尽量保持不改动） ===
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
        uvs = fUvs[i];
        fUvs.push([ uvs[2].clone ? uvs[2].clone() : uvs[2], uvs[1].clone ? uvs[1].clone() : uvs[1], uvs[0].clone ? uvs[0].clone() : uvs[0] ]);
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

    // ======> 关键部分：构造非索引属性（位置 + UV）以精确还原 faceVertexUvs
    const faceCount = faces.length;
    if (faceCount === 0) {
      // 空几何
      this.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      return;
    }

    const positions = new Float32Array(faceCount * 9); // 3 verts * 3 coords
    const uvsArray = new Float32Array(faceCount * 6);   // 3 verts * 2 coords
    // groups 按 materialIndex 聚合（start,count 单位为顶点索引数量）
    let groups = [];
    let curMat = faces[0].materialIndex || 0;
    let groupStartFace = 0;

    for (let fi = 0; fi < faceCount; fi++) {
      const face = faces[fi];
      const uvForFace = fUvs[fi] || [
        new THREE.Vector2(vertices[face.a].x, vertices[face.a].y),
        new THREE.Vector2(vertices[face.b].x, vertices[face.b].y),
        new THREE.Vector2(vertices[face.c].x, vertices[face.c].y)
      ];

      // positions
      const va = vertices[face.a], vb = vertices[face.b], vc = vertices[face.c];
      const pOff = fi * 9;
      positions[pOff + 0] = va.x; positions[pOff + 1] = va.y; positions[pOff + 2] = va.z;
      positions[pOff + 3] = vb.x; positions[pOff + 4] = vb.y; positions[pOff + 5] = vb.z;
      positions[pOff + 6] = vc.x; positions[pOff + 7] = vc.y; positions[pOff + 8] = vc.z;

      // uvs
      const uvOff = fi * 6;
      uvsArray[uvOff + 0] = (uvForFace[0] && uvForFace[0].x !== undefined) ? uvForFace[0].x : va.x;
      uvsArray[uvOff + 1] = (uvForFace[0] && uvForFace[0].y !== undefined) ? uvForFace[0].y : va.y;
      uvsArray[uvOff + 2] = (uvForFace[1] && uvForFace[1].x !== undefined) ? uvForFace[1].x : vb.x;
      uvsArray[uvOff + 3] = (uvForFace[1] && uvForFace[1].y !== undefined) ? uvForFace[1].y : vb.y;
      uvsArray[uvOff + 4] = (uvForFace[2] && uvForFace[2].x !== undefined) ? uvForFace[2].x : vc.x;
      uvsArray[uvOff + 5] = (uvForFace[2] && uvForFace[2].y !== undefined) ? uvForFace[2].y : vc.y;

      // group handling (materialIndex change => cut group)
      const mat = face.materialIndex || 0;
      if (mat !== curMat) {
        groups.push({ start: groupStartFace * 3, count: (fi - groupStartFace) * 3, materialIndex: curMat });
        groupStartFace = fi;
        curMat = mat;
      }
    }
    // push last group
    groups.push({ start: groupStartFace * 3, count: (faceCount - groupStartFace) * 3, materialIndex: curMat });

    // set BufferGeometry attributes (non-indexed)
    this.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.setAttribute('uv', new THREE.BufferAttribute(uvsArray, 2));
    // add groups
    for (const g of groups) {
      this.addGroup(g.start, g.count, g.materialIndex);
    }
    // compute normals
    this.computeVertexNormals();
    // metadata
    this.userdata = { trace: side, rawVertices: vertices.length, rawFaces: faces.length };
  }
}
