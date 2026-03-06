import { useState, useRef, useEffect, useCallback } from 'react';

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const TC = { jeet:'#4EADDB', gutgash:'#E89B3E', pinkeye:'#B06BD6', mm3030:'#E05A4F', unknown:'#8B9AA0' };
const PR = 5;

// ═══════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════
function hex8(){const a=new Uint8Array(4);crypto.getRandomValues(a);return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();}
function uid(s){let id;do{id=hex8();}while(s.has(id));s.add(id);return id;}
function cids(doc){const s=new Set();doc.querySelectorAll('object[id]').forEach(o=>s.add(o.getAttribute('id').toUpperCase()));doc.querySelectorAll('value[type="objectid"]').forEach(v=>{const p=v.textContent.split(',')[0].trim().toUpperCase();if(p&&p!=='0')s.add(p);});return s;}
function gv(o,n){for(const v of o.querySelectorAll(':scope > value'))if(v.getAttribute('name')===n)return v.textContent;return '';}
function sv(o,n,t){for(const v of o.querySelectorAll(':scope > value'))if(v.getAttribute('name')===n){v.textContent=t;return;}}
function d2s(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy;if(!l)return Math.hypot(px-ax,py-ay);let t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/l));return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));}
function xv(d,a,t){const v=d.createElement('value');for(const[k,val]of Object.entries(a))v.setAttribute(k,val);v.appendChild(d.createTextNode(t||''));return v;}
function bo(d,id,vals,ind){const o=d.createElement('object');o.setAttribute('id',id);const inn=ind+'\t';for(const v of vals){o.appendChild(d.createTextNode('\n'+inn));o.appendChild(v);}o.appendChild(d.createTextNode('\n'+ind));return o;}
function wmat(x,y,z,pv,nx){let r='1,0,0,0,0,1,0,0,0,0,1,0';if(pv&&nx){let fx=nx.x-pv.x,fz=nx.z-pv.z;const l=Math.sqrt(fx*fx+fz*fz);if(l>0.001){fx/=l;fz/=l;r=`${fz},0,${-fx},0,0,1,0,0,${fx},0,${fz},0`;}}return `${r}, ${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)},1`;}

// Find root-level object by its _object_id value
function findByObjId(root, oid) {
  if (!oid || oid === '0') return null;
  for (const ch of root.children) {
    if (ch.nodeType !== 1) continue;
    const v = gv(ch, '_object_id');
    if (v && v.split(',')[0].trim().toUpperCase() === oid.toUpperCase()) return ch;
    // Check one level deeper (e.g. DustCloud emitter inside a parent CTransformObject)
    for (const gc of ch.children) {
      if (gc.nodeType !== 1) continue;
      const gv2 = gv(gc, '_object_id');
      if (gv2 && gv2.split(',')[0].trim().toUpperCase() === oid.toUpperCase()) return ch; // return PARENT
    }
  }
  return null;
}

// Deep clone a root-level satellite object, remap all IDs, return {clone, idMap}
function cloneSatellite(doc, srcObj, existingIds) {
  if (!srcObj) return { clone: null, idMap: new Map() };
  const cl = srcObj.cloneNode(true);
  const idMap = new Map();
  const remap = (old) => { if (!old || old === '0') return old; const u = old.toUpperCase(); if (!idMap.has(u)) idMap.set(u, uid(existingIds)); return idMap.get(u); };
  // Remap object ids
  cl.querySelectorAll('object[id]').forEach(o => { const old = o.getAttribute('id'); o.setAttribute('id', remap(old)); });
  // Remap objectid values
  cl.querySelectorAll('value[type="objectid"]').forEach(v => {
    const parts = v.textContent.split(',');
    if (parts.length >= 2 && parts[0].trim() !== '0') { parts[0] = remap(parts[0].trim()); v.textContent = parts.join(','); }
  });
  return { clone: cl, idMap };
}

// ═══════════════════════════════════════════
// XML PARSER
// ═══════════════════════════════════════════
function parseXml(xmlStr) {
  const doc = new DOMParser().parseFromString(xmlStr, 'text/xml');
  const root = doc.querySelector('object > object[name="root"]');
  if (!root) return { doc:null, convoys:[], np:{}, err:'No root' };
  const np = {};
  for (const obj of root.children) {
    if (obj.nodeType!==1) continue;
    if (gv(obj,'_class')==='CNamedPoint') {
      const n=gv(obj,'name'), w=gv(obj,'world');
      if (n&&w) { const p=w.split(',').map(s=>parseFloat(s.trim())); if(p.length>=16) np[n]={x:p[12],y:p[13],z:p[14],obj}; }
    }
  }
  const convoys = [];
  for (const mover of root.children) {
    if (mover.nodeType!==1||gv(mover,'_class')!=='CTransformObject'||gv(mover,'name')!=='MoverObject') continue;
    let has=false; mover.querySelectorAll('value').forEach(v=>{if(v.textContent.includes('convoy_choreographer'))has=true;}); if(!has)continue;
    const c = { moverObj:mover, points:[], props:{}, routeEntries:[], satellites:{} };
    for (const ch of mover.children) {
      if(ch.nodeType!==1) continue;
      const cls=gv(ch,'_class'), nm=gv(ch,'name');
      if(cls==='CGameObjectOrderedList'&&nm==='Route') {
        const ents=[];
        for(const e of ch.children){if(e.nodeType!==1||gv(e,'_class')!=='SGameObjectOrderedListEntry')continue;const en=gv(e,'name');let pr='';e.querySelectorAll('value').forEach(v=>{if(v.getAttribute('id')==='8E4189F6')pr=v.textContent;});ents.push({name:en,ref:pr,entryObj:e});}
        ents.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
        c.routeListObj=ch; c.routeEntries=ents;
        for(const e of ents){if(e.ref&&np[e.ref]){const p=np[e.ref];c.points.push({name:e.ref,x:p.x,y:p.y,z:p.z,entryObj:e.entryObj,npObj:p.obj});}}
      }
      if(cls==='CGraphScriptGameObject') {
        ch.querySelectorAll(':scope > value').forEach(v=>{const n=v.getAttribute('name');if(n)c.props[n]=v.textContent;});
        c.logicObj=ch;
      }
    }
    // Identify satellite objectids from LogicGraph
    if (c.logicObj) {
      ['SpawnTransform','CoreRoadMover','SpawnerMapIcon','DustCloudEffectEmitter','ConvoyData','EncampmentAnchor'].forEach(key => {
        const val = gv(c.logicObj, key);
        if (val) { const oid = val.split(',')[0].trim(); c.satellites[key] = { oid, srcObj: findByObjId(root, oid) }; }
      });
    }
    const le=c.props.ConvoyLeaderDestoyedEvent||'';
    c.territory=le.includes('pinkeye')?'pinkeye':le.includes('713D86D7')?'jeet':le.includes('00A8B716')?'gutgash':le.includes('BCC88294')?'mm3030':'unknown';
    c.routeName=c.points.length>0?c.points[0].name.replace(/_nap\d+$/,''):'convoy_'+convoys.length;
    const rel=c.props.RelicRevealWreckedGuiIconEvent||'';
    c.convoyId=rel?rel.replace('.hoodornament.reveal',''):c.routeName;
    c.origNp=new Set(c.points.map(p=>p.npObj).filter(Boolean));
    c.origEnt=new Set(c.points.map(p=>p.entryObj).filter(Boolean));
    convoys.push(c);
  }
  return { doc, convoys, np, err:null };
}

// ═══════════════════════════════════════════
// GUI ROADS PARSER
// ═══════════════════════════════════════════
function parseGuiRoads(xmlStr) {
  // 1. Find all <array id="#N"> marker positions (nested <array> tags break lazy regex)
  const markerRe = /<array id="(#\d+)">/g;
  const markers = [];
  let m;
  while ((m = markerRe.exec(xmlStr)) !== null) {
    markers.push({ pos: m.index + m[0].length, id: m[1] });
  }
  // 2. For each marker, extract chunk up to next marker, find inner <array>X Y Z</array>
  const posRe = /<array>([-\d.e+ ]+)<\/array>/g;
  const sampleArrays = {};
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].pos;
    const end = i + 1 < markers.length ? markers[i + 1].pos : xmlStr.length;
    const chunk = xmlStr.substring(start, end);
    const positions = [];
    let pm;
    posRe.lastIndex = 0;
    while ((pm = posRe.exec(chunk)) !== null) {
      const coords = pm[1].trim().split(/\s+/).map(Number);
      if (coords.length >= 3) positions.push({ x: coords[0], z: coords[2] });
    }
    if (positions.length > 0) sampleArrays[markers[i].id] = positions;
  }
  // 3. Parse road definitions
  const roadRe = /<struct type="GameGUIRoad">\s*<member name="SamplesLeft">(#\d+)<\/member>\s*<member name="SamplesRight">(#\d+)<\/member>\s*<\/struct>/g;
  const roads = [];
  while ((m = roadRe.exec(xmlStr)) !== null) {
    const left = sampleArrays[m[1]];
    if (left && left.length >= 2) roads.push(left);
  }
  return roads;
}

// ═══════════════════════════════════════════
// SERIALIZE XML
// ═══════════════════════════════════════════
function serialize(doc, convoys, np) {
  const root = doc.querySelector('object > object[name="root"]');
  const eids = cids(doc);
  for (const c of convoys) {
    // Update existing points
    for (const pt of c.points) {
      if (!pt.npObj) continue;
      sv(pt.npObj,'name',pt.name);
      const wv=pt.npObj.querySelector('value[name="world"]');
      if(wv){const p=wv.textContent.split(',').map(s=>s.trim());if(p.length>=16){p[12]=' '+pt.x.toFixed(4);p[13]=pt.y.toFixed(4);p[14]=pt.z.toFixed(4);wv.textContent=p.join(',');}}
    }
    // Update editable LogicGraph properties
    if (c.logicObj && c._editedProps) {
      for (const [k,v] of Object.entries(c._editedProps)) {
        sv(c.logicObj, k, v);
      }
    }
    if (!c.routeListObj) continue;
    // Create new points
    for (let i=0;i<c.points.length;i++) {
      const pt=c.points[i]; if(pt.npObj)continue;
      const nid=uid(eids),noid=uid(eids),nal=uid(eids),eid=uid(eids),eoid=uid(eids);
      pt.name=`${c.routeName}_nap${i+1}`;
      const pv=c.points[(i-1+c.points.length)%c.points.length],nx=c.points[(i+1)%c.points.length];
      const ws=wmat(pt.x,pt.y,pt.z,pv,nx);
      const npEl=bo(doc,nid,[xv(doc,{name:'_class',type:'string'},'CNamedPoint'),xv(doc,{name:'_class_hash',type:'int'},'-650404390'),xv(doc,{name:'_object_id',type:'objectid'},`${noid},0`),xv(doc,{name:'alias',type:'objectid'},`${nal},0`),xv(doc,{name:'disable_event',type:'vec_events'},''),xv(doc,{name:'enable_event',type:'vec_events'},''),xv(doc,{name:'enabled_from_start',type:'int'},'1'),xv(doc,{name:'name',type:'string'},pt.name),xv(doc,{name:'tags',type:'vec_int'},''),xv(doc,{name:'world',type:'mat'},ws)],'\t\t\t');
      root.insertBefore(doc.createTextNode('\n\t\t\t'),c.moverObj);root.insertBefore(npEl,c.moverObj);
      const rv=xv(doc,{type:'string'},pt.name);rv.setAttribute('id','8E4189F6');
      const entEl=bo(doc,eid,[xv(doc,{name:'_class',type:'string'},'SGameObjectOrderedListEntry'),xv(doc,{name:'_class_hash',type:'int'},'-685330639'),xv(doc,{name:'_object_id',type:'objectid'},`${eoid},0`),xv(doc,{name:'name',type:'string'},`OrderedEntry.Point${i+1}`),xv(doc,{name:'tags',type:'vec_int'},''),rv],'\t\t\t\t\t');
      const last=c.routeListObj.lastChild;
      if(last&&last.nodeType===3){c.routeListObj.insertBefore(doc.createTextNode('\n\t\t\t\t\t'),last);c.routeListObj.insertBefore(entEl,last);}else{c.routeListObj.appendChild(doc.createTextNode('\n\t\t\t\t\t'));c.routeListObj.appendChild(entEl);}
      pt.npObj=npEl;pt.entryObj=entEl;np[pt.name]={x:pt.x,y:pt.y,z:pt.z,obj:npEl};
    }
    // Renumber
    for(let i=0;i<c.points.length;i++){const pt=c.points[i];if(!pt.entryObj)continue;sv(pt.entryObj,'name',`OrderedEntry.Point${i+1}`);pt.entryObj.querySelectorAll('value').forEach(v=>{if(v.getAttribute('id')==='8E4189F6')v.textContent=pt.name;});}
    // Remove deleted
    const aNp=new Set(c.points.map(p=>p.npObj).filter(Boolean)),aEnt=new Set(c.points.map(p=>p.entryObj).filter(Boolean));
    if(c.origEnt)for(const e of c.origEnt)if(!aEnt.has(e)&&e.parentNode)e.parentNode.removeChild(e);
    if(c.origNp)for(const n of c.origNp)if(!aNp.has(n)&&n.parentNode)n.parentNode.removeChild(n);
    c.origNp=aNp;c.origEnt=aEnt;
  }
  doc.querySelectorAll('value, object').forEach(el=>{if(!el.childNodes.length)el.appendChild(doc.createTextNode(''));});
  let xml=new XMLSerializer().serializeToString(doc);
  if(!xml.startsWith('<?xml'))xml='<?xml version="1.0" encoding="utf-8"?>\n'+xml;
  return xml;
}

// ═══════════════════════════════════════════
// CLONE CONVOY WITH SATELLITES
// ═══════════════════════════════════════════
function cloneConvoy(doc, src, routeName, territory, points, editProps) {
  const root = doc.querySelector('object > object[name="root"]');
  const eids = cids(doc);

  // 1. Clone satellite objects and build old→new objectid mapping
  const satIdMap = new Map();
  const satKeys = ['SpawnTransform','CoreRoadMover','SpawnerMapIcon','DustCloudEffectEmitter','ConvoyData','EncampmentAnchor'];
  for (const key of satKeys) {
    const sat = src.satellites[key];
    if (!sat || !sat.srcObj) continue;
    const { clone, idMap } = cloneSatellite(doc, sat.srcObj, eids);
    if (clone) {
      root.appendChild(doc.createTextNode('\n\t\t\t'));
      root.appendChild(clone);
      // Map old _object_id to new one
      for (const [oldId, newId] of idMap) {
        satIdMap.set(oldId, newId);
      }
    }
  }

  // 2. Deep clone MoverObject
  const cl = src.moverObj.cloneNode(true);
  const moverIdMap = new Map();
  const remap = (old) => { if(!old||old==='0')return old; const u=old.toUpperCase(); if(!moverIdMap.has(u))moverIdMap.set(u,uid(eids)); return moverIdMap.get(u); };
  cl.querySelectorAll('object[id]').forEach(o=>{o.setAttribute('id',remap(o.getAttribute('id')));});
  cl.querySelectorAll('value[type="objectid"]').forEach(v=>{
    const parts=v.textContent.split(',');
    if(parts.length>=2){
      const oldOid=parts[0].trim().toUpperCase();
      if(oldOid!=='0'){
        // Check if this references a satellite — use satIdMap first
        if(satIdMap.has(oldOid)) parts[0]=satIdMap.get(oldOid);
        else parts[0]=remap(oldOid);
        v.textContent=parts.join(',');
      }
    }
  });
  // Update MoverObject's own _object_id
  const moId=cl.querySelector(':scope > value[name="_object_id"]');
  if(moId){const p=moId.textContent.split(',');p[0]=uid(eids);moId.textContent=p.join(',');}

  // 3. Clear old route entries
  const rl=Array.from(cl.children).find(c=>c.nodeType===1&&gv(c,'_class')==='CGameObjectOrderedList'&&gv(c,'name')==='Route');
  if(rl)Array.from(rl.children).forEach(c=>{if(c.nodeType===1&&gv(c,'_class')==='SGameObjectOrderedListEntry')rl.removeChild(c);});

  // 4. Find LogicGraph in clone
  let logicObj = null;
  Array.from(cl.children).forEach(c=>{if(c.nodeType===1&&gv(c,'_class')==='CGraphScriptGameObject'){logicObj=c;}});

  // Apply edited properties to the cloned LogicGraph
  if (logicObj && editProps) {
    for (const [k,v] of Object.entries(editProps)) {
      sv(logicObj, k, String(v));
    }
  }

  const convoy = {
    moverObj:cl, routeListObj:rl, logicObj, territory, routeName,
    convoyId:routeName, points:[], props:{}, satellites:{},
    origNp:new Set(), origEnt:new Set(), _editedProps: editProps || {},
  };
  if(logicObj)logicObj.querySelectorAll(':scope > value').forEach(v=>{const n=v.getAttribute('name');if(n)convoy.props[n]=v.textContent;});

  // 5. Create CNamedPoints + route entries
  for(let i=0;i<points.length;i++){
    const pt=points[i];
    const nid=uid(eids),noid=uid(eids),nal=uid(eids),eid=uid(eids),eoid=uid(eids);
    const name=`${routeName}_nap${i+1}`;
    const pv=points[(i-1+points.length)%points.length],nx=points[(i+1)%points.length];
    const ws=wmat(pt.x,pt.y,pt.z,pv,nx);
    const npEl=bo(doc,nid,[xv(doc,{name:'_class',type:'string'},'CNamedPoint'),xv(doc,{name:'_class_hash',type:'int'},'-650404390'),xv(doc,{name:'_object_id',type:'objectid'},`${noid},0`),xv(doc,{name:'alias',type:'objectid'},`${nal},0`),xv(doc,{name:'disable_event',type:'vec_events'},''),xv(doc,{name:'enable_event',type:'vec_events'},''),xv(doc,{name:'enabled_from_start',type:'int'},'1'),xv(doc,{name:'name',type:'string'},name),xv(doc,{name:'tags',type:'vec_int'},''),xv(doc,{name:'world',type:'mat'},ws)],'\t\t\t');
    root.appendChild(doc.createTextNode('\n\t\t\t'));root.appendChild(npEl);
    const rv=xv(doc,{type:'string'},name);rv.setAttribute('id','8E4189F6');
    const entEl=bo(doc,eid,[xv(doc,{name:'_class',type:'string'},'SGameObjectOrderedListEntry'),xv(doc,{name:'_class_hash',type:'int'},'-685330639'),xv(doc,{name:'_object_id',type:'objectid'},`${eoid},0`),xv(doc,{name:'name',type:'string'},`OrderedEntry.Point${i+1}`),xv(doc,{name:'tags',type:'vec_int'},''),rv],'\t\t\t\t\t');
    if(rl){rl.appendChild(doc.createTextNode('\n\t\t\t\t\t'));rl.appendChild(entEl);}
    convoy.points.push({name,x:pt.x,y:pt.y,z:pt.z,npObj:npEl,entryObj:entEl});
    convoy.origNp.add(npEl);convoy.origEnt.add(entEl);
  }
  root.appendChild(doc.createTextNode('\n\t\t\t'));root.appendChild(cl);
  return convoy;
}

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════
export default function ConvoyEditor() {
  const cvRef = useRef(null);
  const wrRef = useRef(null);
  const docRef = useRef(null);
  const npRef = useRef({});
  const fnRef = useRef('convoys.xml');

  const [convoys, setConvoys] = useState([]);
  const [sc, setSc] = useState(-1); // selected convoy
  const [sp, setSp] = useState(-1); // selected point
  const [vis, setVis] = useState(new Set());
  const [tool, setTool] = useState('select');
  const [cam, setCam] = useState({ x:0, y:0, z:0.04 });
  const [toast, setToast] = useState('');
  const [mod, setMod] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [roads, setRoads] = useState([]); // GUI roads
  const [showRoads, setShowRoads] = useState(true);
  const [roadsLoaded, setRoadsLoaded] = useState(false);

  // New convoy dialog
  const [dlg, setDlg] = useState(false);
  const [nName, setNName] = useState('');
  const [nTerr, setNTerr] = useState('jeet');
  const [nTpl, setNTpl] = useState(0);
  const [nCompId, setNCompId] = useState('');
  const [nSpeedMin, setNSpeedMin] = useState('25');
  const [nSpeedMax, setNSpeedMax] = useState('30');
  const [nLoop, setNLoop] = useState('1');
  const [nActive, setNActive] = useState('0');

  // Creating mode
  const [creating, setCreating] = useState(null);

  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const dragRef = useRef(null);
  const [mw, setMw] = useState([0,0]);

  const tst = useCallback(m => { setToast(m); setTimeout(()=>setToast(''), 2500); }, []);

  // Coord transforms
  const w2s = useCallback((wx,wz,c) => {
    const cv=cvRef.current;if(!cv)return[0,0];
    return [(wx-c.x)*c.z+cv.width/2, (wz-c.y)*c.z+cv.height/2];
  }, []);
  const s2w = useCallback((sx,sy,c) => {
    const cv=cvRef.current;if(!cv)return[0,0];
    return [(sx-cv.width/2)/c.z+c.x, (sy-cv.height/2)/c.z+c.y];
  }, []);

  // Undo
  const snap = useCallback(()=>convoys.map(c=>({points:c.points.map(p=>({...p}))})),[convoys]);
  const pu = useCallback(()=>{undoRef.current.push(snap());if(undoRef.current.length>40)undoRef.current.shift();redoRef.current=[];setMod(true);},[snap]);
  const undo = useCallback(()=>{if(!undoRef.current.length)return;redoRef.current.push(snap());const p=undoRef.current.pop();setConvoys(cs=>cs.map((c,i)=>({...c,points:p[i]?p[i].points.map(pp=>({...pp})):c.points})));},[snap]);
  const redo = useCallback(()=>{if(!redoRef.current.length)return;undoRef.current.push(snap());const n=redoRef.current.pop();setConvoys(cs=>cs.map((c,i)=>({...c,points:n[i]?n[i].points.map(pp=>({...pp})):c.points})));},[snap]);

  // File open
  const openFile = useCallback(()=>{
    const inp=document.createElement('input');inp.type='file';inp.accept='.xml';
    inp.onchange=e=>{
      const f=e.target.files[0];if(!f)return;fnRef.current=f.name;
      const r=new FileReader();r.onload=ev=>{
        const{doc,convoys:cs,np,err}=parseXml(ev.target.result);
        if(err){tst('Error: '+err);return;}
        docRef.current=doc;npRef.current=np;setConvoys(cs);setVis(new Set(cs.map((_,i)=>i)));
        setSc(-1);setSp(-1);setLoaded(true);setMod(false);undoRef.current=[];redoRef.current=[];
        tst(`Loaded ${cs.length} convoys, ${Object.keys(np).length} waypoints`);
        let mix=Infinity,max=-Infinity,miz=Infinity,maz=-Infinity;
        for(const c of cs)for(const p of c.points){mix=Math.min(mix,p.x);max=Math.max(max,p.x);miz=Math.min(miz,p.z);maz=Math.max(maz,p.z);}
        if(mix!==Infinity){const cv=cvRef.current;const rX=max-mix+2000,rZ=maz-miz+2000;const z=cv?Math.min(cv.width/rX,cv.height/rZ)*0.85:0.04;setCam({x:(mix+max)/2,y:(miz+maz)/2,z});}
      };r.readAsText(f);
    };inp.click();
  },[tst]);

  // Load GUI roads from file picker
  const loadRoads = useCallback(()=>{
    const inp=document.createElement('input');inp.type='file';inp.accept='.xml';
    inp.onchange=e=>{
      const f=e.target.files[0];if(!f)return;
      const r=new FileReader();r.onload=ev=>{
        const rds=parseGuiRoads(ev.target.result);
        setRoads(rds);setRoadsLoaded(true);setShowRoads(true);
        tst(`Loaded ${rds.length} GUI roads`);
      };r.readAsText(f);
    };inp.click();
  },[tst]);

  // Auto-load GUI roads from bundled file
  useEffect(()=>{
    fetch('/guiroadmeshc.xml').then(r=>{if(!r.ok)throw new Error(r.status);return r.text();}).then(txt=>{
      const rds=parseGuiRoads(txt);
      if(rds.length){setRoads(rds);setRoadsLoaded(true);setShowRoads(true);}
    }).catch(()=>{});
  },[]);

  // Save
  const saveFile = useCallback(()=>{
    if(!docRef.current)return;
    const xml=serialize(docRef.current,convoys,npRef.current);
    const blob=new Blob([xml],{type:'application/xml'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=url;a.download=fnRef.current||'convoys.xml';document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),1000);setMod(false);tst('Saved '+fnRef.current);
  },[convoys,tst]);

  // Start new convoy
  const startNew = useCallback(()=>{
    if(!convoys.length){tst('Load XML first');return;}
    setDlg(true);setNName('');setNTerr('jeet');setNTpl(0);
    // Pre-fill from template
    const t=convoys[0];
    setNCompId(t.props.ConvoyCompositionId||'0');
    setNSpeedMin(t.props.speed_min||'25');setNSpeedMax(t.props.speed_max||'30');
    setNLoop(t.props.Loop||'1');setNActive(t.props.ConvoyActive||'0');
  },[convoys,tst]);

  // When template changes, pre-fill its properties
  const onTplChange = useCallback((idx)=>{
    setNTpl(idx);
    const t=convoys[idx];if(!t)return;
    setNCompId(t.props.ConvoyCompositionId||'0');
    setNSpeedMin(t.props.speed_min||'25');setNSpeedMax(t.props.speed_max||'30');
    setNLoop(t.props.Loop||'1');setNActive(t.props.ConvoyActive||'0');
  },[convoys]);

  const beginPlace = useCallback(()=>{
    if(!nName.trim()){tst('Enter route name');return;}
    setDlg(false);
    setCreating({routeName:nName.trim(),territory:nTerr,tplIdx:nTpl,
      editProps:{ConvoyCompositionId:nCompId,speed_min:nSpeedMin,speed_max:nSpeedMax,Loop:nLoop,ConvoyActive:nActive},
      points:[]});
    setTool('create');tst('Click to place points (min 3). Enter to finish.');
  },[nName,nTerr,nTpl,nCompId,nSpeedMin,nSpeedMax,nLoop,nActive,tst]);

  const finishNew = useCallback(()=>{
    if(!creating||creating.points.length<3){tst('Need 3+ points');return;}
    const src=convoys[creating.tplIdx];if(!src)return;
    const nc=cloneConvoy(docRef.current,src,creating.routeName,creating.territory,creating.points,creating.editProps);
    nc.convoyId=creating.routeName;
    setConvoys(prev=>{const next=[...prev,nc];setVis(v=>new Set([...v,next.length-1]));setSc(next.length-1);setSp(-1);return next;});
    setCreating(null);setTool('select');setMod(true);
    tst(`Created "${creating.routeName}" with ${creating.points.length} pts + satellites`);
  },[creating,convoys,tst]);

  // Point ops
  const delPt = useCallback((ci,pi)=>{
    setConvoys(prev=>{const c=prev[ci];if(c.points.length<=2)return prev;pu();const next=[...prev];const pts=[...c.points];pts.splice(pi,1);pts.forEach((p,i)=>{p.name=`${c.routeName}_nap${i+1}`;});next[ci]={...c,points:pts};return next;});
    setSp(p=>Math.min(p,convoys[ci]?.points.length-2||0));tst('Point deleted');
  },[pu,convoys,tst]);

  const insPt = useCallback((ci,pi)=>{
    setConvoys(prev=>{pu();const next=[...prev];const c={...next[ci]};const pts=[...c.points];const pA=pts[pi],pB=pts[(pi+1)%pts.length];
    pts.splice(pi+1,0,{name:'',x:(pA.x+pB.x)/2,y:(pA.y+pB.y)/2,z:(pA.z+pB.z)/2,entryObj:null,npObj:null});
    pts.forEach((p,i)=>{p.name=`${c.routeName}_nap${i+1}`;});c.points=pts;next[ci]=c;return next;});
    setSp(pi+1);tst('Point inserted');
  },[pu,tst]);

  const addPtW = useCallback((ci,wx,wz)=>{
    setConvoys(prev=>{pu();const next=[...prev];const c={...next[ci]};const pts=[...c.points];
    let bi=pts.length-1,bd=Infinity;
    for(let i=0;i<pts.length;i++){const j=(i+1)%pts.length;const d=d2s(wx,wz,pts[i].x,pts[i].z,pts[j].x,pts[j].z);if(d<bd){bd=d;bi=i;}}
    const pA=pts[bi],pB=pts[(bi+1)%pts.length];
    pts.splice(bi+1,0,{name:'',x:wx,y:(pA.y+pB.y)/2,z:wz,entryObj:null,npObj:null});
    pts.forEach((p,i)=>{p.name=`${c.routeName}_nap${i+1}`;});c.points=pts;next[ci]=c;setSp(bi+1);return next;});
    tst('Point added');
  },[pu,tst]);

  // Hit test
  const hitTest = useCallback((sx,sy,cs,c)=>{
    const order=[];if(sc>=0)order.push(sc);for(let i=0;i<cs.length;i++)if(i!==sc&&vis.has(i))order.push(i);
    for(const ci of order){const cv=cs[ci];for(let pi=cv.points.length-1;pi>=0;pi--){const[px,py]=w2s(cv.points[pi].x,cv.points[pi].z,c);if(Math.hypot(sx-px,sy-py)<PR+8)return{ci,pi};}}
    return null;
  },[sc,vis,w2s]);

  // Update convoy property
  const setProp = useCallback((ci,key,val)=>{
    setConvoys(prev=>{const next=[...prev];const c={...next[ci]};c.props={...c.props,[key]:val};
    if(!c._editedProps)c._editedProps={};c._editedProps[key]=val;next[ci]=c;return next;});
    setMod(true);
  },[]);

  // ── RENDER ──
  const render = useCallback((cs,c,selC,selP,vi,cr,rds,sr) => {
    const cv=cvRef.current;if(!cv)return;const ctx=cv.getContext('2d');const w=cv.width,h=cv.height;
    ctx.clearRect(0,0,w,h);
    // Grid
    let gs=1000;if(c.z>0.1)gs=100;else if(c.z>0.02)gs=500;
    const tlx=(0-w/2)/c.z+c.x,tlz=(0-h/2)/c.z+c.y,brx=(w-w/2)/c.z+c.x,brz=(h-h/2)/c.z+c.y;
    ctx.strokeStyle='#131316';ctx.lineWidth=0.5;ctx.beginPath();
    for(let x=Math.floor(tlx/gs)*gs;x<=brx;x+=gs){const sx=(x-c.x)*c.z+w/2;ctx.moveTo(sx,0);ctx.lineTo(sx,h);}
    for(let z=Math.floor(tlz/gs)*gs;z<=brz;z+=gs){const sy=(z-c.y)*c.z+h/2;ctx.moveTo(0,sy);ctx.lineTo(w,sy);}
    ctx.stroke();
    const ox=(0-c.x)*c.z+w/2,oy=(0-c.y)*c.z+h/2;
    ctx.strokeStyle='#1e1e24';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(ox,0);ctx.lineTo(ox,h);ctx.moveTo(0,oy);ctx.lineTo(w,oy);ctx.stroke();

    // GUI Roads overlay
    if(sr&&rds.length>0){
      ctx.strokeStyle='#5c4a2e';ctx.lineWidth=Math.max(1.2,c.z*8);ctx.globalAlpha=0.7;
      for(const rd of rds){
        if(rd.length<2)continue;
        // Frustum cull: check if any point is near viewport
        let inView=false;
        for(let i=0;i<rd.length;i+=Math.max(1,Math.floor(rd.length/10))){
          const sx=(rd[i].x-c.x)*c.z+w/2,sy=(rd[i].z-c.y)*c.z+h/2;
          if(sx>-200&&sx<w+200&&sy>-200&&sy<h+200){inView=true;break;}
        }
        if(!inView)continue;
        ctx.beginPath();
        for(let i=0;i<rd.length;i++){
          const sx=(rd[i].x-c.x)*c.z+w/2,sy=(rd[i].z-c.y)*c.z+h/2;
          if(i===0)ctx.moveTo(sx,sy);else ctx.lineTo(sx,sy);
        }
        ctx.stroke();
      }
      ctx.globalAlpha=1;
    }

    // Convoys
    cs.forEach((convoy,ci)=>{
      if(!vi.has(ci))return;const color=TC[convoy.territory]||TC.unknown;const isSel=ci===selC;const alpha=isSel?1:0.4;const pts=convoy.points;if(pts.length<2)return;
      ctx.strokeStyle=color;ctx.lineWidth=isSel?2.5:1.2;ctx.globalAlpha=alpha;ctx.setLineDash(isSel?[]:[6,4]);
      ctx.beginPath();for(let i=0;i<pts.length;i++){const[sx,sy]=w2s(pts[i].x,pts[i].z,c);if(i===0)ctx.moveTo(sx,sy);else ctx.lineTo(sx,sy);}
      const[s0x,s0y]=w2s(pts[0].x,pts[0].z,c);ctx.lineTo(s0x,s0y);ctx.stroke();ctx.setLineDash([]);
      // Arrows
      if(isSel&&c.z>0.02)for(let i=0;i<pts.length;i++){const j=(i+1)%pts.length;const[ax,ay]=w2s(pts[i].x,pts[i].z,c);const[bx,by]=w2s(pts[j].x,pts[j].z,c);const mx=(ax+bx)/2,my=(ay+by)/2,an=Math.atan2(by-ay,bx-ax);ctx.save();ctx.translate(mx,my);ctx.rotate(an);ctx.fillStyle=color;ctx.globalAlpha=0.5;ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(-3,-3);ctx.lineTo(-3,3);ctx.closePath();ctx.fill();ctx.restore();}
      // Points
      ctx.globalAlpha=alpha;for(let i=0;i<pts.length;i++){const[sx,sy]=w2s(pts[i].x,pts[i].z,c);const sel=isSel&&i===selP;const r=sel?PR+3:PR;ctx.beginPath();ctx.arc(sx,sy,r+2,0,Math.PI*2);ctx.fillStyle=sel?'#f1c40f':'rgba(0,0,0,0.5)';ctx.fill();ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);ctx.fillStyle=i===0?'#2ecc71':color;ctx.fill();if(isSel&&c.z>0.025){ctx.fillStyle='#ddd';ctx.font='10px monospace';ctx.globalAlpha=0.7;ctx.fillText(`${i+1}`,sx+r+3,sy+3);ctx.globalAlpha=alpha;}}
      // Label
      if(c.z>0.012){const ctr=pts.reduce((a,p)=>({x:a.x+p.x/pts.length,z:a.z+p.z/pts.length}),{x:0,z:0});const[lx,ly]=w2s(ctr.x,ctr.z,c);ctx.fillStyle=color;ctx.globalAlpha=isSel?0.9:0.35;ctx.font=`${isSel?12:10}px sans-serif`;ctx.textAlign='center';ctx.fillText(convoy.convoyId,lx,ly-14);ctx.textAlign='left';}
      ctx.globalAlpha=1;
    });
    // Creating preview
    if(cr&&cr.points.length>0){const pts=cr.points;const col=TC[cr.territory]||'#fff';ctx.strokeStyle=col;ctx.lineWidth=2;ctx.globalAlpha=0.8;ctx.setLineDash([4,4]);ctx.beginPath();for(let i=0;i<pts.length;i++){const[sx,sy]=w2s(pts[i].x,pts[i].z,c);if(i===0)ctx.moveTo(sx,sy);else ctx.lineTo(sx,sy);}if(pts.length>2){const[sx,sy]=w2s(pts[0].x,pts[0].z,c);ctx.lineTo(sx,sy);}ctx.stroke();ctx.setLineDash([]);for(let i=0;i<pts.length;i++){const[sx,sy]=w2s(pts[i].x,pts[i].z,c);ctx.beginPath();ctx.arc(sx,sy,6,0,Math.PI*2);ctx.fillStyle=i===0?'#2ecc71':col;ctx.fill();ctx.fillStyle='#fff';ctx.font='10px monospace';ctx.fillText(`${i+1}`,sx+8,sy+3);}ctx.globalAlpha=1;}
  },[w2s]);

  // Resize
  useEffect(()=>{const cv=cvRef.current;const wr=wrRef.current;if(!cv||!wr)return;const rs=()=>{const r=wr.getBoundingClientRect();cv.width=r.width;cv.height=r.height;};rs();const ob=new ResizeObserver(rs);ob.observe(wr);return()=>ob.disconnect();},[]);
  useEffect(()=>{render(convoys,cam,sc,sp,vis,creating,roads,showRoads);},[convoys,cam,sc,sp,vis,creating,roads,showRoads,render]);

  // Mouse handlers
  const onMD = useCallback(e=>{
    const cv=cvRef.current;if(!cv)return;const r=cv.getBoundingClientRect();const sx=e.clientX-r.left,sy=e.clientY-r.top;
    if(e.button===1||(e.button===0&&(tool==='pan'||e.shiftKey))){dragRef.current={type:'pan',sx:e.clientX,sy:e.clientY,cx:cam.x,cy:cam.y};return;}
    if(e.button!==0)return;
    if(tool==='create'&&creating){const[wx,wz]=s2w(sx,sy,cam);setCreating(p=>({...p,points:[...p.points,{x:wx,y:200,z:wz}]}));return;}
    if(tool==='add'&&sc>=0){const[wx,wz]=s2w(sx,sy,cam);addPtW(sc,wx,wz);return;}
    const hit=hitTest(sx,sy,convoys,cam);
    if(hit){setSc(hit.ci);setSp(hit.pi);const pt=convoys[hit.ci].points[hit.pi];dragRef.current={type:'pt',ci:hit.ci,pi:hit.pi,sx:e.clientX,sy:e.clientY,ox:pt.x,oz:pt.z,moved:false};}
    else{if(sp>=0)setSp(-1);else dragRef.current={type:'pan',sx:e.clientX,sy:e.clientY,cx:cam.x,cy:cam.y};}
  },[tool,cam,sc,sp,convoys,creating,hitTest,s2w,addPtW]);

  const onMM = useCallback(e=>{
    const cv=cvRef.current;if(cv){const r=cv.getBoundingClientRect();setMw(s2w(e.clientX-r.left,e.clientY-r.top,cam));}
    const d=dragRef.current;if(!d)return;
    if(d.type==='pan'){const dx=e.clientX-d.sx,dy=e.clientY-d.sy;setCam(c=>({...c,x:d.cx-dx/c.z,y:d.cy-dy/c.z}));return;}
    if(d.type==='pt'){const dx=(e.clientX-d.sx)/cam.z,dy=(e.clientY-d.sy)/cam.z;if(!d.moved&&(Math.abs(dx)>0.5||Math.abs(dy)>0.5)){d.moved=true;pu();}if(d.moved)setConvoys(prev=>{const next=[...prev];const c={...next[d.ci]};const pts=[...c.points];pts[d.pi]={...pts[d.pi],x:d.ox+dx,z:d.oz+dy};c.points=pts;next[d.ci]=c;return next;});}
  },[cam,s2w,pu]);

  const onMU = useCallback(()=>{dragRef.current=null;},[]);
  const onWh = useCallback(e=>{e.preventDefault();setCam(c=>{const cv=cvRef.current;if(!cv)return c;const r=cv.getBoundingClientRect();const sx=e.clientX-r.left,sy=e.clientY-r.top;const wxB=(sx-cv.width/2)/c.z+c.x,wzB=(sy-cv.height/2)/c.z+c.y;const f=e.deltaY<0?1.15:1/1.15;const nz=Math.max(0.001,Math.min(2,c.z*f));const wxA=(sx-cv.width/2)/nz+c.x,wzA=(sy-cv.height/2)/nz+c.y;return{x:c.x+wxB-wxA,y:c.y+wzB-wzA,z:nz};});},[]);

  // Keyboard
  useEffect(()=>{const h=e=>{
    if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;
    if(e.ctrlKey&&e.code==='KeyZ'){e.preventDefault();undo();return;}
    if(e.ctrlKey&&e.code==='KeyY'){e.preventDefault();redo();return;}
    if(e.ctrlKey&&e.code==='KeyS'){e.preventDefault();saveFile();return;}
    if(e.code==='KeyV')setTool('select');if(e.code==='KeyA')setTool('add');
    if(e.code==='Enter'&&creating){finishNew();return;}
    if(e.code==='Escape'&&creating){setCreating(null);setTool('select');tst('Cancelled');return;}
    if((e.code==='Delete'||e.code==='Backspace')&&sc>=0&&sp>=0)delPt(sc,sp);
    if(sc>=0&&sp>=0){const pts=convoys[sc]?.points;if(!pts)return;if(e.code==='ArrowRight'||e.code==='ArrowDown')setSp((sp+1)%pts.length);if(e.code==='ArrowLeft'||e.code==='ArrowUp')setSp((sp-1+pts.length)%pts.length);}
  };window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);},[undo,redo,saveFile,sc,sp,convoys,delPt,creating,finishNew,tst]);

  const fitAll = useCallback(()=>{let mix=Infinity,max=-Infinity,miz=Infinity,maz=-Infinity;for(const c of convoys)for(const p of c.points){mix=Math.min(mix,p.x);max=Math.max(max,p.x);miz=Math.min(miz,p.z);maz=Math.max(maz,p.z);}if(mix===Infinity)return;const cv=cvRef.current;const rX=max-mix+2000,rZ=maz-miz+2000;setCam({x:(mix+max)/2,y:(miz+maz)/2,z:cv?Math.min(cv.width/rX,cv.height/rZ)*0.85:0.04});},[convoys]);

  const selPt = sc>=0&&sp>=0?convoys[sc]?.points[sp]:null;
  const selC = sc>=0?convoys[sc]:null;

  // ── STYLES ──
  const S = {
    root:{display:'flex',flexDirection:'column',height:'100%',background:'#0a0a0d',color:'#c8c5b8',fontFamily:"'Segoe UI',system-ui,sans-serif",fontSize:13,overflow:'hidden'},
    bar:{height:44,background:'#0f0f13',borderBottom:'1px solid #1a1a1f',display:'flex',alignItems:'center',padding:'0 10px',gap:5,flexShrink:0,flexWrap:'wrap'},
    logo:{fontSize:13,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'#d4842a',marginRight:10,whiteSpace:'nowrap'},
    btn:{background:'#16161b',border:'1px solid #1e1e24',color:'#c8c5b8',padding:'3px 10px',fontSize:11,fontWeight:600,cursor:'pointer',letterSpacing:0.3,textTransform:'uppercase',whiteSpace:'nowrap',lineHeight:'22px'},
    bp:{background:'#d4842a',color:'#000',borderColor:'#d4842a'},
    bd:{borderColor:'#c0392b',color:'#c0392b'},
    ba:{background:'#d4842a',color:'#000',borderColor:'#d4842a'},
    sep:{width:1,height:22,background:'#1e1e24',flexShrink:0},
    main:{display:'flex',flex:1,overflow:'hidden'},
    sb:{width:270,minWidth:270,background:'#0f0f13',borderRight:'1px solid #1a1a1f',display:'flex',flexDirection:'column',overflow:'hidden'},
    sh:{padding:'7px 10px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:1.5,color:'#555',borderBottom:'1px solid #1a1a1f',display:'flex',justifyContent:'space-between'},
    ci:{padding:'5px 10px',borderBottom:'1px solid #131316',cursor:'pointer',display:'flex',alignItems:'center',gap:7},
    cw:{flex:1,position:'relative',overflow:'hidden',background:'#08080a'},
    co:{position:'absolute',bottom:8,left:8,fontFamily:'monospace',fontSize:11,color:'#555',background:'rgba(10,10,12,0.85)',padding:'3px 8px',border:'1px solid #1a1a1f',zIndex:10},
    tb:{position:'absolute',top:8,left:8,display:'flex',flexDirection:'column',gap:2,zIndex:10},
    tbtn:{width:30,height:30,background:'rgba(17,17,20,0.9)',border:'1px solid #1a1a1f',color:'#c8c5b8',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14},
    pp:{borderTop:'1px solid #1a1a1f',maxHeight:320,overflowY:'auto',flexShrink:0},
    pph:{padding:'5px 10px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:1.5,color:'#555',background:'#0c0c0f',position:'sticky',top:0,zIndex:1},
    pr:{display:'flex',padding:'2px 10px',fontSize:11,borderBottom:'1px solid #111114',alignItems:'center'},
    pl:{width:70,color:'#555',fontFamily:'monospace',fontSize:10,flexShrink:0},
    pi:{flex:1,background:'#0a0a0d',border:'1px solid #1a1a1f',color:'#e8e5d8',padding:'2px 5px',fontFamily:'monospace',fontSize:11,width:'100%',outline:'none'},
    tt:{position:'absolute',bottom:45,left:'50%',transform:'translateX(-50%)',background:'#0f0f13',border:'1px solid #d4842a',color:'#e8e5d8',padding:'5px 14px',fontSize:11,fontWeight:600,zIndex:300,pointerEvents:'none',whiteSpace:'nowrap'},
    ml:{position:'absolute',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200},
    mb:{background:'#0f0f13',border:'1px solid #1a1a1f',padding:18,width:380,maxHeight:'90vh',overflowY:'auto'},
    sel:{background:'#0a0a0d',border:'1px solid #1a1a1f',color:'#e8e5d8',padding:'3px 6px',fontSize:11,width:'100%',outline:'none'},
    inp:{background:'#0a0a0d',border:'1px solid #1a1a1f',color:'#e8e5d8',padding:'3px 6px',fontSize:11,width:'100%',outline:'none',fontFamily:'monospace'},
    cb:{position:'absolute',top:8,left:'50%',transform:'translateX(-50%)',background:'rgba(15,15,19,0.95)',border:'1px solid #d4842a',color:'#e8e5d8',padding:'5px 14px',fontSize:11,zIndex:20,display:'flex',gap:8,alignItems:'center',whiteSpace:'nowrap'},
    lbl:{fontSize:10,color:'#666',display:'block',marginBottom:2},
  };

  return (
    <div style={S.root}>
      {/* TOP BAR */}
      <div style={S.bar}>
        <div style={S.logo}>Convoy Editor <span style={{color:'#444',fontWeight:400}}>v2</span></div>
        <button style={S.btn} onClick={openFile}>📂 Open</button>
        <button style={{...S.btn,...(mod?S.bp:{})}} onClick={saveFile} disabled={!loaded}>💾 Save</button>
        <div style={S.sep}/>
        <button style={S.btn} onClick={startNew} disabled={!loaded}>＋ New Convoy</button>
        <div style={S.sep}/>
        <button style={S.btn} onClick={loadRoads}>🛣 Roads</button>
        {roadsLoaded && <button style={{...S.btn,...(showRoads?{background:'#1a2520',borderColor:'#2a4530'}:{})}} onClick={()=>setShowRoads(v=>!v)}>{showRoads?'👁':'○'} Roads</button>}
        <div style={S.sep}/>
        <button style={S.btn} onClick={undo}>↩</button>
        <button style={S.btn} onClick={redo}>↪</button>
        <button style={S.btn} onClick={fitAll}>⌂</button>
        <div style={{marginLeft:'auto',fontFamily:'monospace',fontSize:10,color:'#555'}}>{loaded?`${convoys.length} convoys${roadsLoaded?` · ${roads.length} roads`:''}${mod?' · MOD':''}`:''}</div>
      </div>

      <div style={S.main}>
        {/* SIDEBAR */}
        <div style={S.sb}>
          <div style={S.sh}>Convoys <span style={{color:'#d4842a',fontFamily:'monospace'}}>{convoys.length}</span></div>
          <div style={{flex:1,overflowY:'auto'}}>
            {convoys.map((c,i)=>{const col=TC[c.territory]||TC.unknown;const act=i===sc;return(
              <div key={i} style={{...S.ci,background:act?'#16161b':'transparent',borderLeft:act?`3px solid ${col}`:'3px solid transparent'}} onClick={()=>{setSc(i);setSp(-1);}}>
                <div style={{width:7,height:7,borderRadius:'50%',background:col,flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:600,color:'#e8e5d8',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.convoyId}</div>
                  <div style={{fontSize:9,fontFamily:'monospace',color:'#555'}}>{c.routeName} · {c.points.length} pts</div>
                </div>
                <div style={{cursor:'pointer',fontSize:12,color:vis.has(i)?'#777':'#333'}} onClick={e=>{e.stopPropagation();setVis(v=>{const n=new Set(v);if(n.has(i))n.delete(i);else n.add(i);return n;});}}>
                  {vis.has(i)?'●':'○'}
                </div>
              </div>
            );})}
          </div>

          {/* PROPERTIES PANEL */}
          {selC && (
            <div style={S.pp}>
              {selPt ? (<>
                <div style={S.pph}>Point {sp+1} / {selC.points.length}</div>
                {[['Name',selPt.name,null,true],['X',selPt.x.toFixed(1),(v)=>{pu();const val=parseFloat(v)||0;setConvoys(prev=>{const next=[...prev];const c={...next[sc]};const pts=[...c.points];pts[sp]={...pts[sp],x:val};c.points=pts;next[sc]=c;return next;});}],
                  ['Y(alt)',selPt.y.toFixed(1),(v)=>{pu();const val=parseFloat(v)||0;setConvoys(prev=>{const next=[...prev];const c={...next[sc]};const pts=[...c.points];pts[sp]={...pts[sp],y:val};c.points=pts;next[sc]=c;return next;});}],
                  ['Z',selPt.z.toFixed(1),(v)=>{pu();const val=parseFloat(v)||0;setConvoys(prev=>{const next=[...prev];const c={...next[sc]};const pts=[...c.points];pts[sp]={...pts[sp],z:val};c.points=pts;next[sc]=c;return next;});}],
                ].map(([l,v,fn,ro],idx)=>(
                  <div key={idx} style={S.pr}><span style={S.pl}>{l}</span>
                    <input style={{...S.pi,...(ro?{opacity:0.5}:{})}} value={v} readOnly={!!ro} type={ro?'text':'number'} step="1"
                      onChange={fn?e=>fn(e.target.value):undefined}/>
                  </div>
                ))}
                <div style={{padding:'5px 10px',display:'flex',gap:4}}>
                  <button style={{...S.btn,fontSize:10}} onClick={()=>insPt(sc,sp)}>＋ Insert</button>
                  <button style={{...S.btn,...S.bd,fontSize:10}} onClick={()=>delPt(sc,sp)}>🗑 Del</button>
                </div>
              </>) : (<>
                <div style={S.pph}>{selC.convoyId}</div>
                {[
                  ['Route',selC.routeName,null,true],
                  ['Territory',selC.territory,null,true],
                  ['CompID',selC.props.ConvoyCompositionId||'?',(v)=>setProp(sc,'ConvoyCompositionId',v)],
                  ['SpeedMin',selC.props.speed_min||'?',(v)=>setProp(sc,'speed_min',v)],
                  ['SpeedMax',selC.props.speed_max||'?',(v)=>setProp(sc,'speed_max',v)],
                  ['Loop',selC.props.Loop||'?',(v)=>setProp(sc,'Loop',v)],
                  ['Active',selC.props.ConvoyActive||'?',(v)=>setProp(sc,'ConvoyActive',v)],
                  ['Accel',selC.props.accel||'?',(v)=>setProp(sc,'accel',v)],
                  ['Despawn',selC.props.ConvoyDespawnDistance||'?',(v)=>setProp(sc,'ConvoyDespawnDistance',v)],
                  ['SpawnMin',selC.props.SpawnToleranceMin||'?',(v)=>setProp(sc,'SpawnToleranceMin',v)],
                  ['SpawnMax',selC.props.SpawnToleranceMax||'?',(v)=>setProp(sc,'SpawnToleranceMax',v)],
                  ['Points',String(selC.points.length),null,true],
                ].map(([l,v,fn,ro],idx)=>(
                  <div key={idx} style={S.pr}><span style={S.pl}>{l}</span>
                    <input style={{...S.pi,...(ro?{opacity:0.5}:{})}} defaultValue={v} readOnly={!!ro}
                      onBlur={fn?e=>fn(e.target.value):undefined}
                      onKeyDown={fn?e=>{if(e.key==='Enter')fn(e.target.value);}:undefined}/>
                  </div>
                ))}
              </>)}
            </div>
          )}
        </div>

        {/* CANVAS */}
        <div ref={wrRef} style={S.cw}>
          <canvas ref={cvRef} onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onWheel={onWh}
            onContextMenu={e=>e.preventDefault()}
            style={{position:'absolute',top:0,left:0,cursor:tool==='pan'?'grab':tool==='add'||tool==='create'?'crosshair':'default'}}/>
          <div style={S.tb}>
            {[{id:'select',ic:'☝',t:'Select (V)'},{id:'add',ic:'＋',t:'Add Point (A)'},{id:'pan',ic:'✊',t:'Pan'}].map(t=>(
              <button key={t.id} title={t.t} style={{...S.tbtn,...(tool===t.id?S.ba:{})}} onClick={()=>{setTool(t.id);if(creating)setCreating(null);}}>{t.ic}</button>
            ))}
          </div>
          <div style={S.co}>X: {mw[0].toFixed(0)} &nbsp; Z: {mw[1].toFixed(0)}</div>
          {creating&&<div style={S.cb}>
            <span>Creating <b style={{color:'#d4842a'}}>{creating.routeName}</b> — {creating.points.length} pts</span>
            <button style={{...S.btn,fontSize:10}} onClick={finishNew} disabled={creating.points.length<3}>✓ Finish</button>
            <button style={{...S.btn,...S.bd,fontSize:10}} onClick={()=>{setCreating(null);setTool('select');}}>✕</button>
          </div>}
          {toast&&<div style={S.tt}>{toast}</div>}
        </div>
      </div>

      {/* NEW CONVOY DIALOG */}
      {dlg&&<div style={S.ml} onClick={()=>setDlg(false)}>
        <div style={S.mb} onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:14,fontWeight:700,color:'#d4842a',marginBottom:12,textTransform:'uppercase',letterSpacing:1}}>New Convoy</div>
          <div style={{marginBottom:8}}>
            <label style={S.lbl}>Route Name (unique)</label>
            <input style={S.inp} value={nName} onChange={e=>setNName(e.target.value)} placeholder="custom_convoy1" autoFocus/>
          </div>
          <div style={{marginBottom:8}}>
            <label style={S.lbl}>Territory</label>
            <select style={S.sel} value={nTerr} onChange={e=>setNTerr(e.target.value)}>
              <option value="jeet">Jeet</option><option value="gutgash">Gutgash</option>
              <option value="pinkeye">Pink Eye</option><option value="mm3030">MM3030</option>
            </select>
          </div>
          <div style={{marginBottom:8}}>
            <label style={S.lbl}>Clone Template From</label>
            <select style={S.sel} value={nTpl} onChange={e=>onTplChange(parseInt(e.target.value))}>
              {convoys.map((c,i)=>(<option key={i} value={i}>{c.convoyId} ({c.territory})</option>))}
            </select>
            <div style={{fontSize:9,color:'#444',marginTop:2}}>Clones MoverObject + LogicGraph + SpawnTransform + RoadMover + MapIcon + DustCloud + DataContainer + Anchor</div>
          </div>
          <div style={{borderTop:'1px solid #1a1a1f',paddingTop:8,marginBottom:8}}>
            <div style={{fontSize:10,fontWeight:700,color:'#666',marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>Convoy Properties</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
              <div><label style={S.lbl}>CompositionID (hash)</label><input style={S.inp} value={nCompId} onChange={e=>setNCompId(e.target.value)}/></div>
              <div><label style={S.lbl}>Active (0/1)</label><input style={S.inp} value={nActive} onChange={e=>setNActive(e.target.value)}/></div>
              <div><label style={S.lbl}>Speed Min</label><input style={S.inp} value={nSpeedMin} onChange={e=>setNSpeedMin(e.target.value)}/></div>
              <div><label style={S.lbl}>Speed Max</label><input style={S.inp} value={nSpeedMax} onChange={e=>setNSpeedMax(e.target.value)}/></div>
              <div><label style={S.lbl}>Loop (0/1)</label><input style={S.inp} value={nLoop} onChange={e=>setNLoop(e.target.value)}/></div>
            </div>
          </div>
          <div style={{display:'flex',gap:6,marginTop:10}}>
            <button style={{...S.btn,...S.bp,flex:1}} onClick={beginPlace}>Place Points on Map →</button>
            <button style={{...S.btn}} onClick={()=>setDlg(false)}>Cancel</button>
          </div>
        </div>
      </div>}
    </div>
  );
}