/* Inventory System v0.2.4 - Automatic entity registration */
(() => {
  'use strict';
  const EXT='inventory-system', DB_NAME='SillyTavern_InventorySystem', DB_VERSION=3, PANEL='inventory-system-panel';
  const context=()=>SillyTavern.getContext();
  let panel, currentKey=null, currentState=null, dbPromise;
  const uid=p=>`${p}_${crypto.randomUUID?crypto.randomUUID():Date.now()+'_'+Math.random().toString(36).slice(2)}`;
  const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function chatKey(){const c=context();const file=c.chat?.file_name||c.chatId||c.chat?.name||c.chat?.id;const char=c.name2||c.character?.name||'character';return file?`${char}::${file}`:null;}
  function openDb(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const db=r.result;const defs={chats:'chatKey',entities:['chatKey','entityId'],storages:['chatKey','storageId'],items:['chatKey','itemId'],events:['chatKey','eventId'],processed:['chatKey','messageKey']};for(const [name,keyPath] of Object.entries(defs)){if(!db.objectStoreNames.contains(name)){const s=db.createObjectStore(name,{keyPath});if(name!=='chats')s.createIndex('byChat','chatKey',{unique:false});}}};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return dbPromise;}
  async function dbOp(store,mode,fn){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),s=tx.objectStore(store);let result,requestValue;try{result=fn(s);if(result&&typeof result==='object'&&'onsuccess'in result){result.onsuccess=()=>requestValue=result.result;result.onerror=()=>reject(result.error);}}catch(e){reject(e);return;}tx.oncomplete=()=>resolve(requestValue!==undefined?requestValue:result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Transaction aborted'));});}
  const getAll=(store,key)=>dbOp(store,'readonly',s=>s.index('byChat').getAll(key));
  async function log(key,action,payload){await dbOp('events','readwrite',s=>s.put({chatKey:key,eventId:uid('event'),action,payload,timestamp:new Date().toISOString()}));}
  async function ensureChat(key){const old=await dbOp('chats','readonly',s=>s.get(key));const c=context(),charName=c.name2||c.character?.name||'Current Character';if(!old){await dbOp('chats','readwrite',s=>s.put({chatKey:key,schemaVersion:3,createdAt:new Date().toISOString()}));await log(key,'chat_init',{});}else if(old.schemaVersion<3){const storages=await getAll('storages',key),items=await getAll('items',key),byId=new Map(storages.map(st=>[st.storageId,st])),migratedCount=items.filter(i=>i.storageId).length;for(const item of items){if(item.storageId){const st=byId.get(item.storageId);if(!item.ownerId&&st?.ownerId)item.ownerId=st.ownerId;item.storageId='';await dbOp('items','readwrite',s=>s.put(item));}}old.schemaVersion=3;old.migratedAt=new Date().toISOString();await dbOp('chats','readwrite',s=>s.put(old));await log(key,'migration_v3',{flattenedContainers:true,itemsMigrated:migratedCount});}const ents=await getAll('entities',key);if(!ents.some(e=>e.entityId==='user'||e.kind==='user'))await dbOp('entities','readwrite',s=>s.put({chatKey:key,entityId:'user',name:'{{user}}',kind:'user',createdAt:new Date().toISOString()}));if(!ents.some(e=>e.entityId==='char'||e.kind==='char'))await dbOp('entities','readwrite',s=>s.put({chatKey:key,entityId:'char',name:charName,kind:'char',createdAt:new Date().toISOString()}));return true;}
  async function getState(key){await ensureChat(key);const [entities,storages,items,events]=await Promise.all(['entities','storages','items','events'].map(n=>getAll(n,key)));events.sort((a,b)=>b.timestamp.localeCompare(a.timestamp));return {entities,storages,items,events:events.slice(0,100)};}
  async function addEntity(key,name,kind,id){const row={chatKey:key,entityId:id||uid('entity'),name:name.trim(),kind:kind||'npc',createdAt:new Date().toISOString()};await dbOp('entities','readwrite',s=>s.put(row));await log(key,'entity_add',row);}
  async function addStorage(key,name,type,owner,description,alias){const row={chatKey:key,storageId:uid('storage'),name:name.trim(),type:type||'container',ownerId:owner||'',description:description||'',alias:alias||'',createdAt:new Date().toISOString()};await dbOp('storages','readwrite',s=>s.put(row));await log(key,'storage_add',row);return row;}
  async function addItem(key,name,qty,owner,storage,description){const row={chatKey:key,itemId:uid('item'),name:name.trim(),quantity:Math.max(1,Math.floor(Number(qty)||1)),ownerId:owner||'',storageId:'',description:description||'',createdAt:new Date().toISOString()};await dbOp('items','readwrite',s=>s.put(row));await log(key,'item_add',row);}
  async function deleteRow(key,type,id){const store=type==='entity'?'entities':type==='storage'?'storages':'items',field=type==='entity'?'entityId':type==='storage'?'storageId':'itemId';const old=await dbOp(store,'readonly',s=>s.get([key,id]));await dbOp(store,'readwrite',s=>s.delete([key,id]));if(type==='storage')for(const i of (await getAll('items',key)).filter(x=>x.storageId===id)){i.storageId='';await dbOp('items','readwrite',s=>s.put(i));}await log(key,`${type}_delete`,old||{[field]:id});}
  async function moveItem(key,id,owner,storage){const i=await dbOp('items','readonly',s=>s.get([key,id]));if(!i)throw Error('Item not found');const before={ownerId:i.ownerId,storageId:i.storageId};i.ownerId=owner||'';i.storageId=storage||'';await dbOp('items','readwrite',s=>s.put(i));await log(key,'item_move',{itemId:id,from:before,to:{ownerId:i.ownerId,storageId:i.storageId}});}
  async function exportBackup(key){const snap=await getState(key);const b=new Blob([JSON.stringify({chatKey:key,...snap},null,2)],{type:'application/json'}),url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download='inventory-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function importBackup(key,file){const d=JSON.parse(await file.text());if(!Array.isArray(d.entities)||!Array.isArray(d.items)||!Array.isArray(d.storages))throw Error('Invalid inventory backup');await ensureChat(key);for(const n of ['entities','storages','items','events'])for(const row of d[n]||[]){const v={...row,chatKey:key};if(n==='events'&&!v.eventId)v.eventId=uid('event');await dbOp(n,'readwrite',s=>s.put(v));}await log(key,'backup_import',{filename:file.name});}
  function settings(){try{return JSON.parse(localStorage.getItem(EXT+'_settings')||'{}');}catch{return {};}}
  function saveSettings(v){localStorage.setItem(EXT+'_settings',JSON.stringify(v));}
  function diagnostic(stage,message){const el=panel?.querySelector('#inv-diagnostics');if(el){el.textContent=`${new Date().toLocaleTimeString()} · ${stage}: ${message}`;el.dataset.stage=stage;}console.debug(`[Inventory System][${stage}] ${message}`);}
  function extractActionBlock(text){
    const source=String(text||'');
    const candidates=[];
    const comment=/<!--\s*INVENTORY_ACTIONS\s*([\s\S]*?)\s*-->/gi;let m;
    while((m=comment.exec(source))!==null)candidates.push(m[1].trim());
    const fenced=/```(?:json)?\s*([\s\S]*?)```/gi;
    while((m=fenced.exec(source))!==null){const body=m[1].trim();if(body.includes('INVENTORY_ACTIONS'))candidates.push(body.replace(/^INVENTORY_ACTIONS\s*:?\s*/i,''));}
    // Plain-text fallback marker. Extract balanced JSON so nested action objects work.
    const marker=/INVENTORY_ACTIONS\s*:?\s*/gi;
    while((m=marker.exec(source))!==null){let start=source.indexOf('{',m.index+m[0].length);if(start<0)continue;let depth=0,inString=false,escape=false;for(let i=start;i<source.length;i++){const ch=source[i];if(inString){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')inString=false;continue;}if(ch==='"'){inString=true;continue;}if(ch==='{')depth++;else if(ch==='}'){depth--;if(depth===0){candidates.push(source.slice(start,i+1));break;}}}}
    if(!candidates.length)return null;
    let lastError=null;for(const raw of candidates.reverse()){try{const cleaned=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();return JSON.parse(cleaned);}catch(e){lastError=e;}}
    throw new Error(`Action block JSON could not be parsed: ${lastError?.message||'unknown parse error'}`);
  }
  function validate(key,block,state){
    if(!block||!Array.isArray(block.actions)||block.actions.length>20)throw Error('Action list invalid (maximum 20)');
    const eids=new Set(state.entities.map(e=>e.entityId)),sids=new Set(state.storages.map(s=>s.storageId)),entityAliases=new Set(),storageAliases=new Set();
    const allowed=['add','remove','consume','transfer','create_entity'];
    for(const [n,a] of block.actions.entries()){
      if(!allowed.includes(a.type))throw Error(`Action ${n+1}: unsupported type`);
      if(a.type==='add'&&!String(a.item||'').trim())throw Error(`Action ${n+1}: item name required`);
      if(a.type==='create_storage'&&!String(a.name||'').trim())throw Error(`Action ${n+1}: storage name required`);
      if(a.type==='create_entity'&&!String(a.name||'').trim())throw Error(`Action ${n+1}: entity name required`);
      if(['remove','consume','transfer','move'].includes(a.type)&&!String(a.item||'').trim())throw Error(`Action ${n+1}: item name required`);
      if(a.quantity!==undefined&&(!Number.isInteger(Number(a.quantity))||Number(a.quantity)<1))throw Error(`Action ${n+1}: quantity must be a positive integer`);
      if(['remove','consume','transfer','move'].includes(a.type)&&(!Object.hasOwn(a,'owner')||!Object.hasOwn(a,'storage')))throw Error(`Action ${n+1}: source owner and storage fields must be explicit`);
      if(a.owner&&!eids.has(a.owner)&&!entityAliases.has(a.owner))throw Error(`Action ${n+1}: owner ID/alias unknown`);
      if(a.toOwner&&!eids.has(a.toOwner)&&!entityAliases.has(a.toOwner))throw Error(`Action ${n+1}: recipient ID/alias unknown`);
      if(a.type==='create_entity'&&a.alias){if(entityAliases.has(a.alias)||storageAliases.has(a.alias))throw Error(`Action ${n+1}: duplicate alias ${a.alias}`);entityAliases.add(a.alias);}
      const checkStorage=(v,field)=>{if(v===undefined||v===''||v===null)return;if(sids.has(v))return;if(typeof v==='string'&&storageAliases.has(v))return;throw Error(`Action ${n+1}: ${field} storage ID/alias unknown (${v})`);};
      checkStorage(a.storage,'source');checkStorage(a.toStorage,'destination');
      if(a.type==='transfer'&&!a.toOwner)throw Error(`Action ${n+1}: toOwner required`);
      if(a.type==='move'&&!Object.hasOwn(a,'toStorage'))throw Error(`Action ${n+1}: toStorage field required`);
      if(a.type==='create_storage'&&a.alias){if(entityAliases.has(a.alias)||storageAliases.has(a.alias))throw Error(`Action ${n+1}: duplicate alias ${a.alias}`);storageAliases.add(a.alias);}
    }
    return block.actions;
  }
  async function findMatches(key,a){const st=await getState(key);return st.items.filter(i=>i.name.toLowerCase()===String(a.item).toLowerCase()&&i.ownerId===(a.owner||'')&&i.storageId===(a.storage||''));}
  const ownerName=(state,id)=>state.entities.find(e=>e.entityId===id)?.name||id||'Unassigned';
  const storageName=(state,id)=>state.storages.find(s=>s.storageId===id)?.name||id||'Carried';
  async function verifyItemCount(key,name,owner,storage){const st=await getState(key);return st.items.filter(i=>i.name.toLowerCase()===String(name).toLowerCase()&&i.ownerId===(owner||'')&&i.storageId===(storage||'')).reduce((n,i)=>n+i.quantity,0);}
  async function applyOne(key,a,state,aliases={}){
    const entityId=v=>v&&aliases[v]?aliases[v]:v||'';
    a={...a,owner:entityId(a.owner),toOwner:entityId(a.toOwner)};
    if(a.type==='create_entity'){const st=await getState(key);const existing=st.entities.find(e=>e.name.toLowerCase()===a.name.trim().toLowerCase());if(existing){if(a.alias)aliases[a.alias]=existing.entityId;return {type:a.type,item:a.name,status:'success',owner:existing.name,message:`Entity already registered: ${existing.name}`};}await addEntity(key,a.name,a.kind||'npc',undefined);const after=await getState(key),created=after.entities.find(e=>e.name.toLowerCase()===a.name.trim().toLowerCase());if(!created)throw Error(`Entity verification failed for ${a.name}`);if(a.alias)aliases[a.alias]=created.entityId;state.entities.push(created);return {type:a.type,item:a.name,status:'success',owner:created.name,message:`Registered ${a.kind||'npc'} ${created.name}`};}
    const storageId=v=>v&&aliases[v]?aliases[v]:v||'';
    a={...a,storage:storageId(a.storage),toStorage:storageId(a.toStorage)};
    if(a.type==='add'){
      const qty=Number(a.quantity||1),before=await verifyItemCount(key,a.item,a.owner||'',a.storage||'');await addItem(key,a.item,qty,a.owner||'',a.storage||'',a.description||'');
      const actual=await verifyItemCount(key,a.item,a.owner||'',a.storage||'');if(actual-before!==qty)throw Error(`Verification failed after add: expected change ${qty}, found ${actual-before}`);
      return {type:a.type,item:a.item,quantity:qty,owner:ownerName(state,a.owner),storage:storageName(await getState(key),a.storage),status:'success',message:`Added ${a.item} ×${qty} to ${ownerName(state,a.owner)} (${storageName(await getState(key),a.storage)})`};
    }
    if(a.type==='create_storage'){
      const row=await addStorage(key,a.name,a.storageType||'container',a.owner||'',a.description||'',a.alias||'');const st=await getState(key);const found=st.storages.find(x=>x.storageId===row.storageId);
      if(!found)throw Error(`Verification failed: storage “${a.name}” not found after creation`);
      if(a.alias)aliases[a.alias]=found.storageId;
      return {type:a.type,item:a.name,quantity:0,owner:ownerName(state,a.owner),storage:found.name,status:'success',message:`Created storage “${found.name}” for ${ownerName(state,a.owner)}${a.alias?` (reference ${a.alias})`:''}`};
    }
    const matches=await findMatches(key,a);const available=matches.reduce((n,i)=>n+i.quantity,0);const quantity=Number(a.quantity||available);const targetOwner=a.type==='transfer'?a.toOwner:(a.owner||''),targetStorage=a.type==='move'?(a.toStorage||''):(a.storage||''),targetBefore=await verifyItemCount(key,a.item,targetOwner,targetStorage);if(!available||quantity<1)throw Error(`No available item: ${a.item}`);if(available<quantity)throw Error(`Insufficient quantity for ${a.item}: ${available} available, ${quantity} requested`);let rem=quantity;
    for(const i of matches){if(rem<=0)break;const take=Math.min(rem,i.quantity);rem-=take;
      if(['remove','consume'].includes(a.type)){i.quantity-=take;if(i.quantity<=0)await dbOp('items','readwrite',s=>s.delete([key,i.itemId]));else await dbOp('items','readwrite',s=>s.put(i));await log(key,a.type,{item:i.name,quantity:take,owner:i.ownerId,storage:i.storageId});}
      else if(a.type==='transfer'){const sourceOwner=i.ownerId,sourceStorage=i.storageId;if(take===i.quantity){i.ownerId=a.toOwner;await dbOp('items','readwrite',s=>s.put(i));}else{i.quantity-=take;await dbOp('items','readwrite',s=>s.put(i));await addItem(key,i.name,take,a.toOwner,sourceStorage,i.description);}await log(key,'transfer',{item:i.name,quantity:take,fromOwner:sourceOwner,toOwner:a.toOwner,storage:sourceStorage});}
      else if(a.type==='move'){const sourceOwner=i.ownerId,sourceStorage=i.storageId;if(take===i.quantity){i.storageId=a.toStorage||'';await dbOp('items','readwrite',s=>s.put(i));}else{i.quantity-=take;await dbOp('items','readwrite',s=>s.put(i));await addItem(key,i.name,take,sourceOwner,a.toStorage||'',i.description);}await log(key,'move',{item:i.name,quantity:take,owner:sourceOwner,fromStorage:sourceStorage,toStorage:a.toStorage||''});}
    }
    let verified=true,details='';if(a.type==='transfer'){verified=await verifyItemCount(key,a.item,a.toOwner,a.storage||'')-targetBefore===quantity;details=`${quantity} × ${a.item}: ${ownerName(state,a.owner)} → ${ownerName(state,a.toOwner)}`;}
    else if(a.type==='move'){verified=await verifyItemCount(key,a.item,a.owner||'',a.toStorage||'')-targetBefore===quantity;details=`${quantity} × ${a.item}: ${storageName(await getState(key),a.storage)} → ${storageName(await getState(key),a.toStorage)}`;}
    else {verified=await verifyItemCount(key,a.item,a.owner||'',a.storage||'')===available-quantity;details=`${a.type==='consume'?'Consumed':'Removed'} ${quantity} × ${a.item} from ${ownerName(state,a.owner)} (${storageName(await getState(key),a.storage)})`;}
    if(!verified)throw Error(`Post-operation verification failed for ${a.type} ${a.item}`);
    return {type:a.type,item:a.item,quantity,owner:ownerName(state,a.owner),status:'success',message:details};
  }
  async function processMessage(key,messageKey,text){
    if(settings().autoApply===false){await log(key,'ai_action_skipped',{status:'skipped',message:'Auto-apply is disabled',messageKey});return {status:'disabled'};}
    const prior=await dbOp('processed','readonly',s=>s.get([key,messageKey]));if(prior)return {status:'duplicate'};
    let block;try{block=extractActionBlock(text);}catch(e){await log(key,'ai_action_error',{status:'error',message:`Malformed action JSON: ${e.message}`,messageKey});return {status:'error',message:`Malformed action JSON: ${e.message}`};}
    if(!block){await log(key,'ai_action_none',{status:'none',message:'No inventory action block in assistant message',messageKey});return {status:'none'};}
    const state=await getState(key);let actions;try{actions=validate(key,block,state);}catch(e){await log(key,'ai_action_error',{status:'error',message:e.message,messageKey});return {status:'error',message:e.message};}
    // Preflight ordered operations with temporary storage aliases, including containers created earlier in this batch.
    const shadow=state.items.map(i=>({...i})),shadowStorages=new Set(state.storages.map(st=>st.storageId)),aliases={},entityAliases={};
    try{for(const [idx,a] of actions.entries()){
      const resolve=v=>v&&aliases[v]?aliases[v]:v||'',resolveOwner=v=>v&&entityAliases[v]?entityAliases[v]:v||'';const sourceStorage=resolve(a.storage),destStorage=resolve(a.toStorage),sourceOwner=resolveOwner(a.owner),targetOwner=resolveOwner(a.toOwner);
      if(a.type==='create_entity'){if(a.alias)entityAliases[a.alias]=`__new_entity_${idx}__`;continue;}
      if(a.type==='create_storage'){if(a.alias)aliases[a.alias]=`__new_storage_${idx}__`;shadowStorages.add(aliases[a.alias]||`__new_storage_${idx}__`);continue;}
      if(['remove','consume','transfer','move'].includes(a.type)){const matches=shadow.filter(i=>i.name.toLowerCase()===String(a.item).toLowerCase()&&i.ownerId===sourceOwner&&i.storageId===sourceStorage);const total=matches.reduce((n,i)=>n+i.quantity,0),requested=Number(a.quantity||total);if(total<requested)throw Error(`Insufficient quantity for ${a.item}: ${total} available, ${requested} requested`);let left=requested;for(const i of matches){const take=Math.min(left,i.quantity);i.quantity-=take;left-=take;if(left<=0)break;}if(a.type==='transfer')shadow.push({name:a.item,quantity:requested,ownerId:targetOwner,storageId:sourceStorage});if(a.type==='move')shadow.push({name:a.item,quantity:requested,ownerId:a.owner||'',storageId:destStorage});}
      else if(a.type==='add'){if(a.storage&& !shadowStorages.has(sourceStorage)&&!aliases[a.storage])throw Error(`Action ${idx+1}: storage target not found`);shadow.push({name:a.item,quantity:Number(a.quantity||1),ownerId:sourceOwner,storageId:sourceStorage});}
    }}catch(e){await log(key,'ai_action_error',{status:'error',message:e.message,messageKey});return {status:'error',message:e.message};}
    const results=[],runtimeAliases={};for(const [idx,a] of actions.entries()){try{const result=await applyOne(key,a,state,runtimeAliases);results.push(result);await log(key,'ai_action_result',{...result,messageKey,operation:idx+1});}catch(e){const failure={type:a.type,item:a.item||a.name,quantity:a.quantity||1,status:'error',message:e.message};results.push(failure);await log(key,'ai_action_result',{...failure,messageKey,operation:idx+1});await dbOp('processed','readwrite',s=>s.put({chatKey:key,messageKey,processedAt:new Date().toISOString(),partial:true}));return {status:'partial_or_failed',results,message:e.message};}}
    await dbOp('processed','readwrite',s=>s.put({chatKey:key,messageKey,processedAt:new Date().toISOString()}));return {status:'applied',results};
  }
  function buildPanel(){if(document.getElementById(PANEL))return;const root=document.querySelector('#extensions_settings');if(!root)return;panel=document.createElement('div');panel.id=PANEL;panel.className='inline-drawer';panel.innerHTML=`<div class="inline-drawer-toggle inline-drawer-header"><b>Inventory System · v0.3.0</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div></div><div class="inline-drawer-content"><div class="inv-toolbar"><button class="menu_button" id="inv-refresh">Refresh</button><button class="menu_button" id="inv-backup">Backup</button><label class="menu_button">Restore<input id="inv-restore" type="file" accept=".json" hidden></label><label class="inv-auto"><input id="inv-auto" type="checkbox"> Auto-apply AI changes</label></div><div id="inv-chat" class="inv-small"></div><div id="inv-status" class="inv-status"></div><details class="inv-diagnostic" open><summary>AI pipeline diagnostics</summary><div id="inv-diagnostics">Idle · waiting for generation</div></details><div id="inv-content"></div><details class="inv-form" open><summary>Add item</summary><div class="inv-grid"><input id="inv-item-name" placeholder="Item name"><input id="inv-item-qty" type="number" min="1" value="1"><select id="inv-item-owner"><option value="">Owner</option></select><input id="inv-item-desc" placeholder="Description"><button class="menu_button" id="inv-add-item">Add</button></div></details><p class="inv-note">AI changes are experimental. Export backups regularly.</p></div>`;root.append(panel);
    panel.querySelector('.inline-drawer-toggle').onclick=()=>{const c=panel.querySelector('.inline-drawer-content');c.classList.toggle('open');panel.querySelector('.inline-drawer-icon').classList.toggle('fa-circle-chevron-down');panel.querySelector('.inline-drawer-icon').classList.toggle('fa-circle-chevron-up');};
    panel.querySelector('#inv-auto').checked=settings().autoApply!==false;panel.querySelector('#inv-auto').onchange=e=>saveSettings({...settings(),autoApply:e.target.checked});panel.querySelector('#inv-refresh').onclick=refresh;panel.querySelector('#inv-backup').onclick=()=>currentKey&&exportBackup(currentKey);panel.querySelector('#inv-restore').onchange=async e=>{const f=e.target.files?.[0];if(!f||!currentKey)return;try{await importBackup(currentKey,f);await refresh();toastr.success('Inventory backup restored');}catch(err){toastr.error(err.message);}e.target.value='';};
    panel.querySelector('#inv-add-item').onclick=async()=>{const n=panel.querySelector('#inv-item-name').value.trim();if(!n)return toastr.warning('Item name required');await addItem(currentKey,n,panel.querySelector('#inv-item-qty').value,panel.querySelector('#inv-item-owner').value,'',panel.querySelector('#inv-item-desc').value);panel.querySelector('#inv-item-name').value='';await refresh();};}
  function render(){
    if(!panel||!currentState)return;const {entities,items,events}=currentState;
    const el=panel.querySelector('#inv-item-owner'),old=el.value;el.innerHTML='<option value="">Owner (optional)</option>'+entities.map(e=>`<option value="${escapeHtml(e.entityId)}">${escapeHtml(e.name)}</option>`).join('');if(old)el.value=old;
    const ownerLabel=id=>entities.find(e=>e.entityId===id)?.name||id||'Unassigned';
    const entityCards=entities.map(e=>`<li><span><b>${escapeHtml(e.name)}</b><small>${escapeHtml(e.kind)} · ${escapeHtml(e.entityId)}</small></span></li>`).join('');
    const grouped=entities.map(e=>{const own=items.filter(i=>i.ownerId===e.entityId);return `<section class="inv-owner"><b>${escapeHtml(e.name)} · Inventory</b><ul>${own.length?own.map(i=>`<li><span><b>${escapeHtml(i.name)} ×${escapeHtml(i.quantity)}</b>${i.description?`<small>${escapeHtml(i.description)}</small>`:''}</span><button class="menu_button inv-delete" data-type="item" data-id="${escapeHtml(i.itemId)}">×</button></li>`).join(''):'<li class="inv-empty">Empty inventory</li>'}</ul></section>`;}).join('');
    const unassigned=items.filter(i=>!i.ownerId);const unassignedCard=unassigned.length?`<section class="inv-owner"><b>Unassigned items</b><ul>${unassigned.map(i=>`<li><span><b>${escapeHtml(i.name)} ×${escapeHtml(i.quantity)}</b></span><button class="menu_button inv-delete" data-type="item" data-id="${escapeHtml(i.itemId)}">×</button></li>`).join('')}</ul></section>`:'';
    const eventCards=events.slice(0,60).map(e=>{const p=e.payload||{},ok=p.status==='success',bad=p.status==='error',skipped=p.status==='skipped';const label=e.action==='ai_action_result'?`AI · ${p.type||'operation'} #${p.operation||''}`:e.action.startsWith('ai_')?`AI · ${e.action.replace('ai_','').replaceAll('_',' ')}`:e.action;const detail=p.message||(p.item?`${p.item}${p.quantity?` ×${p.quantity}`:''}`:JSON.stringify(p));const badge=ok?'Verified & saved':bad?'Failed':skipped?'Skipped':'Recorded';return `<li class="inv-event ${ok?'is-success':bad?'is-error':skipped?'is-skipped':''}"><span><b>${escapeHtml(label)}</b><small>${escapeHtml(detail)}</small><small>${new Date(e.timestamp).toLocaleString()} · ${badge}</small></span></li>`}).join('');
    const html=`<div class="inv-section"><b>Characters</b><ul>${entityCards||'<li class="inv-empty">No registered characters</li>'}</ul></div><div class="inv-section"><b>Inventories</b>${grouped}${unassignedCard}</div><div class="inv-section"><b>Activity log</b><ul>${eventCards||'<li class="inv-empty">No events logged yet</li>'}</ul></div>`;
    panel.querySelector('#inv-content').innerHTML=html;
    panel.querySelectorAll('.inv-delete').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this item?'))return;await deleteRow(currentKey,b.dataset.type,b.dataset.id);await refresh();});
  }
  async function refresh(){if(!panel)buildPanel();currentKey=chatKey();if(!currentKey){panel.querySelector('#inv-chat').textContent='Open a chat to begin';return;}panel.querySelector('#inv-chat').textContent=`Separate local database · ${currentKey}`;try{currentState=await getState(currentKey);render();}catch(e){panel.querySelector('#inv-content').textContent=e.message;}}
  function inventorySystemPromptInterceptor(chat,contextSize,abort,type){
    // Keep generation interception synchronous and dependency-free: no IndexedDB,
    // migrations, or async waits are allowed on the provider request path.
    try{
      if(!Array.isArray(chat))return chat;
      const lines=[
        '[INVENTORY SYSTEM v0.3.1 — CHARACTER REGISTRY & SINGLE INVENTORY]',
        'Each character has ONE inventory list. No bags, chests, rings, pockets, storage IDs, or containers are tracked. Every inventory is private; do not disclose or use another character’s inventory unless established by scene events.',
        'When a distinct NPC/character first appears in the active scene or directly participates, include create_entity with name, kind:"npc", and a stable alias. Do not register background mentions, duplicates, or hypothetical characters. For completed inventory changes, use the actions below.',
        'At the very end of the reply append a machine-readable block only when completed scene events change the registry or inventory: <!-- INVENTORY_ACTIONS {"actions":[...]} -->. No code fence. Entity registration alone is valid. No block for plans/hypotheticals.',
        'Allowed actions: create_entity {type:"create_entity",name,kind,alias}; add {type:"add",item,quantity,owner,description}; remove/consume {type:"remove"|"consume",item,quantity,owner}; transfer {type:"transfer",item,quantity,owner,toOwner}. Quantities positive integers. Max 20 actions. Only report completed changes.',
        'Never provide inventory lists to characters. Inventory contents are private and are not included in prompt. Do not create duplicate entities; use aliases in this action block. Example block: <!-- INVENTORY_ACTIONS {\"actions\":[{\"type\":\"create_entity\",\"name\":\"Elara\",\"kind\":\"npc\",\"alias\":\"elara\"},{\"type\":\"add\",\"item\":\"Notebook\",\"quantity\":1,\"owner\":\"elara\"}]} -->'
      ];
      const note={is_user:false,name:'Inventory System',mes:lines.join('\n'),send_date:Date.now(),extra:{inventory_system:true,inventory_private:true,inventory_prompt_injected:true}};
      const lastUser=chat.findLastIndex?chat.findLastIndex(m=>m?.is_user||m?.role==='user'):-1;
      chat.splice(lastUser>=0?lastUser:chat.length,0,note);
      diagnostic('prompt-injected','Synchronous inventory protocol inserted; no DB work performed in interceptor.');
      const statusEl=panel?.querySelector('#inv-status');if(statusEl)statusEl.textContent='Inventory protocol injected; awaiting AI reply.';
      return chat;
    }catch(e){diagnostic('interceptor','Injection failed: '+e.message);console.warn('[Inventory System] Prompt injection error',e);return chat;}
  }
  globalThis.inventorySystemPromptInterceptor=inventorySystemPromptInterceptor;
  function cleanupPromptNotes(){
    const chat=context().chat;
    if(!Array.isArray(chat))return 0;
    let removed=0;
    for(let i=chat.length-1;i>=0;i--){if(chat[i]?.extra?.inventory_prompt_injected){chat.splice(i,1);removed++;}}
    if(removed)diagnostic('cleanup',`Removed ${removed} temporary inventory prompt note(s) from chat history.`);
    return removed;
  }
  async function messageReceived(eventMessage){
    try{
      const key=chatKey();if(!key)return;
      const c=context(),chat=c.chat||[];
      cleanupPromptNotes();
      diagnostic('response','MESSAGE_RECEIVED received; waiting briefly for chat message commit.');
      let chosen=null,text='';
      // Some ST builds emit MESSAGE_RECEIVED before the final assistant message is appended.
      for(let attempt=0;attempt<7&&!chosen;attempt++){
        const candidates=[];
        const supplied=eventMessage&&typeof eventMessage==='object'?(eventMessage.message||eventMessage.mes||eventMessage):null;
        if(supplied&&typeof supplied==='object'&&!supplied.is_user&&supplied.role!=='user')candidates.push(supplied);
        for(let i=chat.length-1;i>=Math.max(0,chat.length-4);i--){const m=chat[i];if(m&&!m.is_user&&m.role!=='user'&&(m.mes||m.message||m.content)&&!candidates.includes(m))candidates.push(m);}
        for(const m of candidates){const t=m.mes||m.message||m.content||'';if(String(t).includes('INVENTORY_ACTIONS')){chosen=m;text=String(t);break;}}
        if(!chosen&&attempt<6)await new Promise(resolve=>setTimeout(resolve,250));
      }
      if(!chosen){diagnostic('parser','Assistant reply received; no INVENTORY_ACTIONS block found after retry window.');await log(key,'ai_action_none',{status:'none',message:'No action block detected after retrying MESSAGE_RECEIVED',messageKey:String(Date.now())});return;}
      const msgKey=String(chosen.mesId||chosen.id||chosen.send_date||`${chat.indexOf(chosen)}_${text.slice(0,100)}`);
      diagnostic('parser','Action block found; parsing JSON.');
      const res=await processMessage(key,msgKey,text);const statusEl=panel?.querySelector('#inv-status');
      if(res.status==='applied'){const successes=res.results.filter(x=>x.status==='success').length,failures=res.results.filter(x=>x.status==='error').length;const summary=`AI: ${successes} verified operation(s)${failures?`, ${failures} failed`:''}`;diagnostic('database',summary);if(statusEl)statusEl.textContent=summary;await refresh();toastr.success(summary,'Inventory System');}
      else if(res.status==='partial_or_failed'){diagnostic('database','Partial failure: '+res.message);if(statusEl)statusEl.textContent=`AI operation failed: ${res.message}`;await refresh();toastr.error(`Inventory operation failed: ${res.message}`,'Inventory System');}
      else if(res.status==='error'){diagnostic('parser','Action block rejected: '+res.message);if(statusEl)statusEl.textContent=`AI action block rejected: ${res.message}`;await refresh();toastr.warning(`No inventory changes: ${res.message}`,'Inventory System');}
      else if(res.status==='disabled'){diagnostic('database','Auto-apply disabled; parsed actions not applied.');if(statusEl)statusEl.textContent='AI inventory actions are disabled. No changes were applied.';await refresh();toastr.info('AI inventory updates are disabled.');}
      else if(res.status==='duplicate'){diagnostic('database','Duplicate block ignored.');if(statusEl)statusEl.textContent='Duplicate AI action block ignored.';}
      else if(res.status==='none'){diagnostic('parser','No action block returned.');if(statusEl)statusEl.textContent='No AI action block in assistant message.';await refresh();}
    }catch(e){diagnostic('database','Handler exception: '+e.message);panel?.querySelector('#inv-status')&&(panel.querySelector('#inv-status').textContent=`AI action error: ${e.message}`);toastr.warning(`No inventory update: ${e.message}`,'Inventory System');console.warn(e);}
  }
  function init(){buildPanel();const c=context();c.eventSource.on(c.event_types.APP_READY,buildPanel);c.eventSource.on(c.event_types.APP_READY,refresh);c.eventSource.on(c.event_types.CHAT_CHANGED,refresh);c.eventSource.on(c.event_types.MESSAGE_RECEIVED,(...args)=>messageReceived(args[0]));if(c.event_types.GENERATION_ENDED)c.eventSource.on(c.event_types.GENERATION_ENDED,cleanupPromptNotes);if(c.event_types.GENERATION_STOPPED)c.eventSource.on(c.event_types.GENERATION_STOPPED,cleanupPromptNotes);}init();
})();
