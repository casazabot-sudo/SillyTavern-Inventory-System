/* Inventory System v0.1.0 — client-only, per-chat IndexedDB */
(() => {
    'use strict';

    const EXT = 'inventory-system';
    const DB_NAME = 'SillyTavern_InventorySystem';
    const DB_VERSION = 1;
    const PANEL_ID = 'inventory-system-panel';
    const context = () => SillyTavern.getContext();
    let panel, activeChatKey = null, cachedState = null, dbPromise;

    function getChatKey() {
        const ctx = context();
        const file = ctx.chat?.file_name || ctx.chatId || ctx.chat?.name || ctx.chat?.id;
        const charName = ctx.name2 || ctx.character?.name || ctx.characters?.[ctx.characterId]?.name || 'character';
        // Avoid using a shared "empty chat" key. Chat identity may differ across ST versions.
        return file ? `${String(charName).trim()}::${String(file).trim()}` : null;
    }
    function uid(prefix) {
        return `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
    }
    function openDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('chats')) db.createObjectStore('chats', { keyPath: 'chatKey' });
                if (!db.objectStoreNames.contains('entities')) {
                    const s = db.createObjectStore('entities', { keyPath: ['chatKey','entityId'] });
                    s.createIndex('byChat', 'chatKey', { unique:false });
                }
                if (!db.objectStoreNames.contains('storages')) {
                    const s = db.createObjectStore('storages', { keyPath: ['chatKey','storageId'] });
                    s.createIndex('byChat', 'chatKey', { unique:false });
                }
                if (!db.objectStoreNames.contains('items')) {
                    const s = db.createObjectStore('items', { keyPath: ['chatKey','itemId'] });
                    s.createIndex('byChat', 'chatKey', { unique:false });
                }
                if (!db.objectStoreNames.contains('events')) {
                    const s = db.createObjectStore('events', { keyPath: ['chatKey','eventId'] });
                    s.createIndex('byChat', 'chatKey', { unique:false });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB could not be opened.'));
        });
        return dbPromise;
    }
    async function txStore(storeName, mode, callback) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            let result;
            let requestResult;
            try {
                result = callback(store, tx);
                if (result && typeof result === 'object' && 'onsuccess' in result && 'result' in result) {
                    result.onsuccess = () => { requestResult = result.result; };
                    result.onerror = () => reject(result.error || new Error('Database request failed.'));
                }
            } catch (err) { reject(err); return; }
            tx.oncomplete = () => resolve(requestResult !== undefined ? requestResult : result);
            tx.onerror = () => reject(tx.error || new Error('Database transaction failed.'));
            tx.onabort = () => reject(tx.error || new Error('Database transaction aborted.'));
        });
    }
    function getAllByChat(storeName, chatKey) {
        return txStore(storeName, 'readonly', store => store.index('byChat').getAll(chatKey));
    }
    async function log(chatKey, action, payload) {
        const event = { chatKey, eventId: uid('event'), action, payload, timestamp: new Date().toISOString() };
        await txStore('events','readwrite',s=>s.put(event));
    }
    async function ensureChat(chatKey) {
        const existing = await txStore('chats','readonly',s=>s.get(chatKey));
        if (existing) return existing;
        const ctx = context();
        const characterName = ctx.name2 || ctx.character?.name || 'Current Character';
        const initial = { chatKey, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), schemaVersion:1 };
        await txStore('chats','readwrite',s=>s.put(initial));
        const defaults = [
            {entityId:'user',name:'{{user}}',kind:'user'},
            {entityId:'char',name:characterName,kind:'char'}
        ];
        for (const entity of defaults) {
            await txStore('entities','readwrite',s=>s.put({chatKey,...entity,createdAt:new Date().toISOString()}));
        }
        await log(chatKey,'chat_init',{entities:defaults});
        return initial;
    }
    async function getState(chatKey) {
        await ensureChat(chatKey);
        const [entities,storages,items,events] = await Promise.all([
            getAllByChat('entities',chatKey),getAllByChat('storages',chatKey),
            getAllByChat('items',chatKey),getAllByChat('events',chatKey)
        ]);
        return { chat: await txStore('chats','readonly',s=>s.get(chatKey)), entities, storages, items,
            events:events.sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).slice(0,100) };
    }
    async function addEntity(chatKey, name, kind, entityId) {
        const entity = {chatKey,entityId:entityId || uid('entity'),name:name.trim(),kind:kind || 'npc',createdAt:new Date().toISOString()};
        await txStore('entities','readwrite',s=>s.put(entity)); await log(chatKey,'entity_add',entity); return entity;
    }
    async function addStorage(chatKey, name, type, ownerId, storageId, description) {
        const storage = {chatKey,storageId:storageId || uid('storage'),name:name.trim(),type:type||'container',ownerId:ownerId||'',description:description||'',createdAt:new Date().toISOString()};
        await txStore('storages','readwrite',s=>s.put(storage)); await log(chatKey,'storage_add',storage); return storage;
    }
    async function addItem(chatKey, name, quantity, ownerId, storageId, description) {
        const item = {chatKey,itemId:uid('item'),name:name.trim(),quantity:Math.max(1,Math.floor(Number(quantity)||1)),ownerId:ownerId||'',storageId:storageId||'',description:description||'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        await txStore('items','readwrite',s=>s.put(item)); await log(chatKey,'item_add',item); return item;
    }
    async function deleteRecord(chatKey, type, id) {
        const storeName = type === 'entity' ? 'entities' : type === 'storage' ? 'storages' : 'items';
        const keyName = type === 'entity' ? 'entityId' : type === 'storage' ? 'storageId' : 'itemId';
        const old = await txStore(storeName,'readonly',s=>s.get([chatKey,id]));
        await txStore(storeName,'readwrite',s=>s.delete([chatKey,id]));
        if (type === 'storage') {
            const items = await getAllByChat('items',chatKey);
            for (const item of items.filter(x=>x.storageId===id)) {
                item.storageId=''; item.updatedAt=new Date().toISOString();
                await txStore('items','readwrite',s=>s.put(item));
            }
        }
        await log(chatKey,`${type}_delete`,old || {[keyName]:id});
    }
    async function moveItem(chatKey, itemId, ownerId, storageId) {
        const item = await txStore('items','readonly',s=>s.get([chatKey,itemId]));
        if (!item) throw new Error('Item not found.');
        const before = {ownerId:item.ownerId,storageId:item.storageId};
        item.ownerId=ownerId||''; item.storageId=storageId||''; item.updatedAt=new Date().toISOString();
        await txStore('items','readwrite',s=>s.put(item));
        await log(chatKey,'item_move',{itemId,from:before,to:{ownerId:item.ownerId,storageId:item.storageId}});
    }
    async function exportChat(chatKey) {
        const state = await getState(chatKey);
        const blob = new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href=url; a.download=`inventory-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    async function importChat(chatKey, file) {
        const parsed = JSON.parse(await file.text());
        if (!parsed || !Array.isArray(parsed.entities) || !Array.isArray(parsed.items) || !Array.isArray(parsed.storages)) throw new Error('This file does not look like an Inventory System backup.');
        await ensureChat(chatKey);
        for (const store of ['entities','storages','items','events']) {
            const rows = parsed[store] || [];
            for (const row of rows) {
                const copy={...row,chatKey};
                if (store==='events' && !copy.eventId) copy.eventId=uid('event');
                await txStore(store,'readwrite',s=>s.put(copy));
            }
        }
        await log(chatKey,'backup_import',{filename:file.name});
    }
    const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function buildPanel() {
        if (document.getElementById(PANEL_ID)) return;
        const root=document.querySelector('#extensions_settings');
        if(!root) return;
        panel=document.createElement('div'); panel.id=PANEL_ID; panel.className='inline-drawer';
        panel.innerHTML=`<div class="inline-drawer-toggle inline-drawer-header"><b>Inventory System · v0.1.0</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div></div>
          <div class="inline-drawer-content">
            <div class="is-toolbar"><button class="menu_button" id="is-refresh">Refresh</button><button class="menu_button" id="is-export">Export backup</button><label class="menu_button is-import-label">Import backup<input id="is-import" type="file" accept=".json,application/json" hidden></label></div>
            <div id="is-chat-label" class="is-muted"></div>
            <div id="is-main">Open a chat to load inventory.</div>
            <details class="is-form"><summary>Add character / NPC</summary><div class="is-grid"><input id="is-entity-name" placeholder="Name"><select id="is-entity-kind"><option value="npc">NPC</option><option value="user">User</option><option value="char">Character</option></select><input id="is-entity-id" placeholder="Optional ID"><button class="menu_button" id="is-add-entity">Create</button></div></details>
            <details class="is-form"><summary>Add storage / container</summary><div class="is-grid"><input id="is-storage-name" placeholder="Storage name"><select id="is-storage-type"><option value="bag">Bag</option><option value="backpack">Backpack</option><option value="spatial_ring">Spatial ring</option><option value="spatial_pocket">Spatial pocket</option><option value="chest">Chest</option><option value="container">Other container</option></select><select id="is-storage-owner"><option value="">Owner (optional)</option></select><input id="is-storage-id" placeholder="Optional storage ID"><input id="is-storage-desc" placeholder="Description"><button class="menu_button" id="is-add-storage">Create</button></div></details>
            <details class="is-form" open><summary>Add item</summary><div class="is-grid"><input id="is-item-name" placeholder="Item name"><input id="is-item-qty" type="number" min="1" value="1"><select id="is-item-owner"><option value="">Owner</option></select><select id="is-item-storage"><option value="">Carried / not in container</option></select><input id="is-item-desc" placeholder="Description / notes"><button class="menu_button" id="is-add-item">Add item</button></div></details>
            <div class="is-footnote">Data is stored in this browser's IndexedDB, separate from chat messages. Export backups regularly.</div>
          </div>`;
        root.append(panel);
        panel.querySelector('.inline-drawer-toggle').onclick=()=>{const c=panel.querySelector('.inline-drawer-content');c.classList.toggle('open');panel.querySelector('.inline-drawer-icon').classList.toggle('fa-circle-chevron-down');panel.querySelector('.inline-drawer-icon').classList.toggle('fa-circle-chevron-up');};
        panel.querySelector('#is-refresh').onclick=refresh;
        panel.querySelector('#is-export').onclick=()=>activeChatKey&&exportChat(activeChatKey);
        panel.querySelector('#is-import').onchange=async e=>{const file=e.target.files?.[0];if(!file||!activeChatKey)return;try{await importChat(activeChatKey,file);await refresh();toastr.success('Backup imported.');}catch(err){toastr.error(err.message,'Inventory System');}e.target.value='';};
        panel.querySelector('#is-add-entity').onclick=async()=>{
            const name=panel.querySelector('#is-entity-name').value.trim(); if(!name)return toastr.warning('Enter a name.');
            const kind=panel.querySelector('#is-entity-kind').value; const id=panel.querySelector('#is-entity-id').value.trim()||undefined;
            try{await addEntity(activeChatKey,name,kind,id);panel.querySelector('#is-entity-name').value='';panel.querySelector('#is-entity-id').value='';await refresh();}catch(e){toastr.error(e.message);}
        };
        panel.querySelector('#is-add-storage').onclick=async()=>{
            const name=panel.querySelector('#is-storage-name').value.trim();if(!name)return toastr.warning('Enter storage name.');
            try{await addStorage(activeChatKey,name,panel.querySelector('#is-storage-type').value,panel.querySelector('#is-storage-owner').value,panel.querySelector('#is-storage-id').value.trim()||undefined,panel.querySelector('#is-storage-desc').value);await refresh();}catch(e){toastr.error(e.message);}
        };
        panel.querySelector('#is-add-item').onclick=async()=>{
            const name=panel.querySelector('#is-item-name').value.trim();if(!name)return toastr.warning('Enter item name.');
            try{await addItem(activeChatKey,name,panel.querySelector('#is-item-qty').value,panel.querySelector('#is-item-owner').value,panel.querySelector('#is-item-storage').value,panel.querySelector('#is-item-desc').value);panel.querySelector('#is-item-name').value='';panel.querySelector('#is-item-desc').value='';await refresh();}catch(e){toastr.error(e.message);}
        };
    }
    function render() {
        if(!panel||!cachedState)return;
        const {entities,storages,items}=cachedState;
        const ownerSelects=['#is-item-owner','#is-storage-owner'];
        for(const sel of ownerSelects){
            const el=panel.querySelector(sel);const old=el.value;
            el.innerHTML=(sel==='#is-storage-owner'?'<option value="">Owner (optional)</option>':'<option value="">Owner</option>')+entities.map(e=>`<option value="${esc(e.entityId)}">${esc(e.name)} · ${esc(e.entityId)}</option>`).join('');
            if(old)el.value=old;
        }
        const storageEl=panel.querySelector('#is-item-storage');const oldStorage=storageEl.value;
        storageEl.innerHTML='<option value="">Carried / not in container</option>'+storages.map(s=>`<option value="${esc(s.storageId)}">${esc(s.name)} · ${esc(s.storageId)}</option>`).join('');
        if(oldStorage)storageEl.value=oldStorage;
        let html='<div class="is-section"><h4>Characters / NPCs</h4><ul>';
        html+=entities.map(e=>`<li><span><strong>${esc(e.name)}</strong> <span class="is-muted">${esc(e.kind)} · ${esc(e.entityId)}</span></span><button class="menu_button is-delete" data-type="entity" data-id="${esc(e.entityId)}">Delete</button></li>`).join('')||'<li>None</li>';
        html+='</ul></div><div class="is-section"><h4>Storages</h4><ul>';
        html+=storages.map(s=>`<li><span><strong>${esc(s.name)}</strong> <span class="is-muted">${esc(s.type)} · ${esc(s.storageId)} · owner ${esc(s.ownerId||'—')}</span></span><button class="menu_button is-delete" data-type="storage" data-id="${esc(s.storageId)}">Delete</button></li>`).join('')||'<li>None</li>';
        html+='</ul></div><div class="is-section"><h4>Items</h4><ul>';
        html+=items.map(i=>{const owner=entities.find(e=>e.entityId===i.ownerId)?.name||i.ownerId||'Unassigned';const storage=storages.find(s=>s.storageId===i.storageId)?.name||'Carried';return `<li class="is-item"><span><strong>${esc(i.name)} ×${esc(i.quantity)}</strong><span class="is-muted">Owner: ${esc(owner)} · Location: ${esc(storage)}</span>${i.description?`<span class="is-muted">${esc(i.description)}</span>`:''}<span class="is-move"><select data-move-owner="${esc(i.itemId)}"><option value="">Owner</option>${entities.map(e=>`<option value="${esc(e.entityId)}" ${e.entityId===i.ownerId?'selected':''}>${esc(e.name)}</option>`).join('')}</select><select data-move-storage="${esc(i.itemId)}"><option value="">Carried</option>${storages.map(s=>`<option value="${esc(s.storageId)}" ${s.storageId===i.storageId?'selected':''}>${esc(s.name)}</option>`).join('')}</select><button class="menu_button" data-move="${esc(i.itemId)}">Move</button></span></span><button class="menu_button is-delete" data-type="item" data-id="${esc(i.itemId)}">Delete</button></li>`}).join('')||'<li>Empty inventory</li>';
        html+='</ul></div><div class="is-section"><h4>Recent changes</h4><ul>';
        html+=(cachedState.events||[]).slice(0,10).map(ev=>`<li><span>${esc(ev.action)} <span class="is-muted">${new Date(ev.timestamp).toLocaleString()}</span></span></li>`).join('')||'<li>No events yet</li>';
        panel.querySelector('#is-main').innerHTML=html;
        panel.querySelectorAll('.is-delete').forEach(btn=>btn.onclick=async()=>{if(!confirm('Delete this record?'))return;try{await deleteRecord(activeChatKey,btn.dataset.type,btn.dataset.id);await refresh();}catch(e){toastr.error(e.message);}});
        panel.querySelectorAll('[data-move]').forEach(btn=>btn.onclick=async()=>{const itemId=btn.dataset.move;const owner=panel.querySelector(`[data-move-owner="${CSS.escape(itemId)}"]`).value;const storage=panel.querySelector(`[data-move-storage="${CSS.escape(itemId)}"]`).value;try{await moveItem(activeChatKey,itemId,owner,storage);await refresh();}catch(e){toastr.error(e.message);}});
    }
    async function refresh() {
        if(!panel)buildPanel();
        const chatKey=getChatKey();
        activeChatKey=chatKey;
        if(!chatKey){cachedState=null;panel.querySelector('#is-chat-label').textContent='No active chat. Open a chat to create its inventory.';panel.querySelector('#is-main').textContent='Inventory will initialize when a chat is selected.';return;}
        panel.querySelector('#is-chat-label').textContent=`Separate inventory database · ${chatKey}`;
        try{cachedState=await getState(chatKey);render();}catch(e){panel.querySelector('#is-main').textContent=`Database error: ${e.message}`;console.error(`[${EXT}]`,e);}
    }
    async function inventorySystemPromptInterceptor(chat) {
        try{
            const chatKey=getChatKey();if(!chatKey)return chat;
            const state=await getState(chatKey);
            const lines=['[INVENTORY SYSTEM — CURRENT STATE]','Inventory state below is the registered source of truth. Mentioned items are not automatically registered. Do not assume items exist unless listed.'];
            for(const entity of state.entities){
                lines.push(`Entity: ${entity.name} (ID: ${entity.entityId}, type: ${entity.kind})`);
                const owned=state.items.filter(item=>item.ownerId===entity.entityId);
                if(!owned.length)lines.push('- No registered items.');
                for(const item of owned){
                    const storage=state.storages.find(s=>s.storageId===item.storageId);
                    lines.push(`- ${item.name} x${item.quantity}${storage?` [in ${storage.name}]`:' [carried]'}${item.description?` — ${item.description}`:''}`);
                }
            }
            for(const storage of state.storages){
                lines.push(`Storage: ${storage.name} (ID: ${storage.storageId}, type: ${storage.type}, owner: ${storage.ownerId||'unassigned'})`);
            }
            lines.push('Prototype note: inventory changes are not yet auto-committed from AI prose. Only changes made in the extension UI are persisted.');
            chat.push({is_system:true,mes:lines.join('\n'),name:'Inventory System'});
            return chat;
        }catch(err){console.warn(`[${EXT}] Prompt injection skipped`,err);return chat;}
    }
    globalThis.inventorySystemPromptInterceptor=inventorySystemPromptInterceptor;
    function init(){
        buildPanel();
        const ctx=context();
        ctx.eventSource.on(ctx.event_types.APP_READY,buildPanel);
        ctx.eventSource.on(ctx.event_types.APP_READY,refresh);
        ctx.eventSource.on(ctx.event_types.CHAT_CHANGED,refresh);
    }
    init();
})();
