// ── SHEETS CONFIG ─────────────────────────────────────────────────────────────
// Cole aqui a URL do Web App do Google Apps Script
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbwWK6JeaeBx9v4L28WtGoT6fxk2fukKdim4IDNPdj4Mv00yqYyq/exec';

async function loadFromSheets() {
  if (!SHEETS_URL || SHEETS_URL.includes('COLE_AQUI')) return;
  try {
    const url = SHEETS_URL + '?d=' + encodeURIComponent(JSON.stringify({ action: 'loadAll' }));
    const res = await fetch(url);
    const json = await res.json();
    if (json.ok && json.data) {
      const d = json.data;
      lancamentos  = d.lancamentos  || {};
      metasList    = d.metas        || [];
      investimentos = d.investimentos || [];
      cartoes      = d.cartoes      || [{ id:1, nome:'Nubank', limite:0 }];
      // Recalcula nextId para evitar duplicatas
      let maxId = 0;
      Object.values(lancamentos).forEach(arr => arr.forEach(l => { if(l.id > maxId) maxId = l.id; }));
      nextId = maxId + 1;
      let maxMeta = 0; metasList.forEach(m => { if(m.id > maxMeta) maxMeta = m.id; }); nextMetaId = maxMeta + 1;
      let maxInv  = 0; investimentos.forEach(i => { if(i.id > maxInv) maxInv = i.id; }); nextInvId  = maxInv  + 1;
      let maxCart = 0; cartoes.forEach(c => { if(c.id > maxCart) maxCart = c.id; }); nextCartaoId = maxCart + 1;
      updateCatSelect(); updateMetaCatSelect(); updateCartaoSelect(); updateInvSelect();
      renderAll();
    }
  } catch(e) { console.warn('Sheets sync error:', e.message); }
}

async function saveToSheets() {
  if (!SHEETS_URL || SHEETS_URL.includes('COLE_AQUI')) return;
  try {
    const payload = { lancamentos, metas: metasList, investimentos, cartoes };
    const url = SHEETS_URL + '?d=' + encodeURIComponent(JSON.stringify({ action: 'saveAll', payload }));
    await fetch(url);
  } catch(e) { console.warn('Sheets save error:', e.message); }
}

const MONTHS = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const CAT_RECEITAS = ['Salário João','Salário Maria','Receitas 3','Receitas 4','Receitas 5','Receitas 6','Receitas 7','Receitas 8','Receitas 9','Receitas 10'];
const CAT_GASTOS = ['Contas de casa','Transportes','Mercado','Lazer','Diversão','Pessoais','Pet','Carro','Categoria 9','Categoria 10','Categoria 11','Categoria 12','Categoria 13','Categoria 14','Categoria 15','Categoria 16','Categoria 17','Categoria 18','Categoria 19','Categoria 20'];
const CAT_INVEST = ['XP Investimentos','Caixinha Nubank 1','Caixinha Nubank 2'];

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let sortCol = 'data_venc', sortDir = 1;
let lancamentos = {}, metasList = [], investimentos = [], cartoes = [{ id:1, nome:'Nubank', limite:0 }];
let nextId = 1, nextMetaId = 1, nextInvId = 1, nextCartaoId = 2;
let editLancId = null, editMetaId = null, editInvIdModal = null;

const $ = id => document.getElementById(id);

// ── CONFIRM ────────────────────────────────────────────────────────────────────
let _confirmResolve = null;
function customConfirm(msg) {
  return new Promise(res => {
    _confirmResolve = res;
    $('confirmMsg').textContent = msg;
    $('confirmModal').classList.add('open');
  });
}
$('btnConfirmYes').addEventListener('click', () => { $('confirmModal').classList.remove('open'); _confirmResolve && _confirmResolve(true); });
$('btnConfirmNo').addEventListener('click',  () => { $('confirmModal').classList.remove('open'); _confirmResolve && _confirmResolve(false); });

// ── UTILS ──────────────────────────────────────────────────────────────────────
const fmt = v => (parseFloat(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
function fmtDate(d) { if(!d) return '—'; try{ const[y,m,dd]=d.split('-'); return `${dd}/${m}/${y}`; }catch{ return d; } }
function showToast(msg) { const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2500); }
function getKey(y,m) { return `${y}-${m}`; }
function getLancs(y,m) { return lancamentos[getKey(y,m)]||[]; }
function openModal(id) { id.classList.add('open'); }
function closeModalEl(id) { id.classList.remove('open'); }

// ── NAV TABS ───────────────────────────────────────────────────────────────────
document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('nav button').forEach(b=>b.classList.remove('active'));
    document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
    btn.classList.add('active');
    if (btn.dataset.tab === 'dashboard') renderDashboard();
  });
});

// ── YEAR ──────────────────────────────────────────────────────────────────────
$('yearSelect').addEventListener('change', () => { currentYear = parseInt($('yearSelect').value); renderAll(); });

// ── MONTH TABS ────────────────────────────────────────────────────────────────
function buildMonthTabs() {
  $('monthTabs').innerHTML = MONTHS.map((m,i) =>
    `<button class="month-btn${i===currentMonth?' active':''}" data-m="${i}">${m}</button>`
  ).join('');
  $('monthTabs').querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => {
      currentMonth = parseInt(b.dataset.m);
      $('monthTabs').querySelectorAll('button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      renderGrid(); updateSummaryBar();
    })
  );
}

// ── LANÇAMENTOS GRID ──────────────────────────────────────────────────────────
function renderGrid() {
  const search = $('searchInput').value.toLowerCase();
  const tipo = $('filterTipo').value;
  const status = $('filterStatus').value;
  let rows = getLancs(currentYear, currentMonth).filter(l => {
    if (tipo && l.tipo !== tipo) return false;
    if (status && getStatus(l) !== status) return false;
    if (search && !(l.categoria||'').toLowerCase().includes(search) && !(l.observacoes||'').toLowerCase().includes(search)) return false;
    return true;
  }).sort((a,b) => {
    let va=a[sortCol]||'', vb=b[sortCol]||'';
    if(sortCol==='valor'){va=parseFloat(va)||0;vb=parseFloat(vb)||0;}
    return va<vb?-sortDir:va>vb?sortDir:0;
  });
  const body = $('gridBody');
  if (!rows.length) { body.innerHTML=`<tr><td colspan="10"><div class="empty-state"><p>Nenhum lançamento.<br>Clique em "+ Novo Lançamento".</p></div></td></tr>`; updateSummaryBar(); return; }
  body.innerHTML = rows.map(l => {
    const st=getStatus(l);
    const sb={'Concluído':'badge-green','Atrasado':'badge-red','Previsto para hoje':'badge-yellow','Previsto':'badge-blue','':'badge-blue'}[st]||'badge-blue';
    const tb=l.tipo==='Recebimento'?'badge-green':'badge-red';
    return `<tr class="clickable" data-id="${l.id}">
      <td><span class="badge ${tb}">${l.tipo}</span></td>
      <td>${l.categoria||'—'}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.observacoes||'—'}</td>
      <td style="font-weight:600;color:${l.tipo==='Recebimento'?'var(--green)':'var(--red)'}">R$ ${fmt(l.valor)}</td>
      <td>${l.forma||'—'}</td><td>${l.cartao||'—'}</td>
      <td>${fmtDate(l.data_venc)}</td><td>${fmtDate(l.data_pag)}</td>
      <td><span class="badge ${sb}">${st||'—'}</span></td>
      <td class="actions-cell" style="display:flex;gap:6px">
        <button class="btn btn-edit edit-lanc" data-id="${l.id}">✏️</button>
        <button class="btn btn-danger del-lanc" data-id="${l.id}">🗑</button>
      </td></tr>`;
  }).join('');
  body.querySelectorAll('tr.clickable').forEach(tr => tr.addEventListener('click', e => {
    if (!e.target.closest('.actions-cell')) openLancModal(parseInt(tr.dataset.id));
  }));
  body.querySelectorAll('.edit-lanc').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openLancModal(parseInt(b.dataset.id)); }));
  body.querySelectorAll('.del-lanc').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); deleteLanc(parseInt(b.dataset.id)); }));
  updateSummaryBar();
}

document.querySelector('thead').addEventListener('click', e => {
  const th = e.target.closest('th[data-sort]');
  if (!th) return;
  if (sortCol===th.dataset.sort) sortDir=-sortDir; else { sortCol=th.dataset.sort; sortDir=1; }
  renderGrid();
});

$('searchInput').addEventListener('input', renderGrid);
$('filterTipo').addEventListener('change', renderGrid);
$('filterStatus').addEventListener('change', renderGrid);

function updateSummaryBar() {
  const ls=getLancs(currentYear,currentMonth);
  const rec=ls.filter(l=>l.tipo==='Recebimento').reduce((s,l)=>s+(parseFloat(l.valor)||0),0);
  const desp=ls.filter(l=>l.tipo==='Gasto').reduce((s,l)=>s+(parseFloat(l.valor)||0),0);
  const sal=rec-desp;
  $('sum-rec').textContent='R$ '+fmt(rec);
  $('sum-desp').textContent='R$ '+fmt(desp);
  $('sum-saldo').textContent='R$ '+fmt(sal);
  $('sum-saldo').style.color=sal>=0?'var(--green)':'var(--red)';
}

function getStatus(l) {
  if(!l.data_venc&&!l.data_pag) return '';
  if(l.data_pag) return 'Concluído';
  const today=new Date(); today.setHours(0,0,0,0);
  const v=new Date(l.data_venc+'T00:00:00');
  if(v<today) return 'Atrasado';
  if(v.getTime()===today.getTime()) return 'Previsto para hoje';
  return 'Previsto';
}

// ── MODAL LANÇAMENTO ──────────────────────────────────────────────────────────
function updateCatSelect() {
  const cats=$('f-tipo').value==='Recebimento'?CAT_RECEITAS:CAT_GASTOS;
  $('f-categoria').innerHTML=cats.map(c=>`<option>${c}</option>`).join('');
}

function openLancModal(id) {
  editLancId = id||null;
  $('modalTitle').textContent = editLancId?'Editar Lançamento':'Novo Lançamento';
  if (editLancId) {
    const l=getLancs(currentYear,currentMonth).find(x=>x.id===editLancId);
    if(l){
      $('f-tipo').value=l.tipo||'Gasto'; updateCatSelect();
      $('f-categoria').value=l.categoria||''; $('f-obs').value=l.observacoes||'';
      $('f-valor').value=l.valor||''; $('f-forma').value=l.forma||'Dinheiro';
      $('f-cartao').value=l.cartao||''; $('f-parcela').value=l.parcela||'';
      $('f-venc').value=l.data_venc||''; $('f-pag').value=l.data_pag||'';
      const isc=l.forma==='Crédito';
      $('f-cartao-group').style.display=isc?'':'none';
      $('f-parcela-group').style.display=isc?'':'none';
    }
  } else {
    $('f-tipo').value='Gasto'; updateCatSelect();
    ['f-obs','f-valor','f-cartao','f-parcela','f-venc','f-pag'].forEach(id=>$(id).value='');
    $('f-forma').value='Dinheiro';
    $('f-cartao-group').style.display='none';
    $('f-parcela-group').style.display='none';
  }
  openModal($('lancModal'));
}

$('f-tipo').addEventListener('change', updateCatSelect);
$('f-forma').addEventListener('change', () => {
  const c=$('f-forma').value==='Crédito';
  $('f-cartao-group').style.display=c?'':'none';
  $('f-parcela-group').style.display=c?'':'none';
});
$('btnNovoLanc').addEventListener('click', () => openLancModal(null));
$('btnLancCancel').addEventListener('click', () => closeModalEl($('lancModal')));
$('btnLancSave').addEventListener('click', saveLanc);

function saveLanc() {
  const valor=parseFloat($('f-valor').value);
  if(!valor||valor<=0){showToast('Informe um valor válido');return;}
  const key=getKey(currentYear,currentMonth);
  if(!lancamentos[key]) lancamentos[key]=[];
  const obj={ id:editLancId||nextId++, tipo:$('f-tipo').value, categoria:$('f-categoria').value,
    observacoes:$('f-obs').value, valor, forma:$('f-forma').value, cartao:$('f-cartao').value,
    parcela:$('f-parcela').value, data_venc:$('f-venc').value, data_pag:$('f-pag').value };
  if(editLancId){ const i=lancamentos[key].findIndex(x=>x.id===editLancId); if(i>=0) lancamentos[key][i]=obj; }
  else lancamentos[key].push(obj);
  closeModalEl($('lancModal')); renderGrid(); renderDashboard(); renderMetas();
  showToast(editLancId?'Lançamento atualizado!':'Lançamento adicionado!');
}

async function deleteLanc(id) {
  if(!await customConfirm('Remover este lançamento?')) return;
  const key=getKey(currentYear,currentMonth);
  lancamentos[key]=(lancamentos[key]||[]).filter(l=>l.id!==id);
  renderGrid(); renderDashboard(); renderMetas(); showToast('Lançamento removido.');
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
let chartAnual,chartCat,chartSaldo;
function renderDashboard() {
  const ls=getLancs(currentYear,currentMonth);
  const rec=ls.filter(l=>l.tipo==='Recebimento').reduce((s,l)=>s+(parseFloat(l.valor)||0),0);
  const desp=ls.filter(l=>l.tipo==='Gasto').reduce((s,l)=>s+(parseFloat(l.valor)||0),0);
  // Investimentos do mês corrente
  const invMes=investimentos.filter(i=>{
    if(!i.data) return false;
    const d=new Date(i.data+'T00:00:00');
    return d.getFullYear()===currentYear && d.getMonth()===currentMonth;
  }).reduce((s,i)=>s+(parseFloat(i.valor)||0),0);
  const sal=rec-desp-invMes;
  $('kpi-receitas').textContent='R$ '+fmt(rec);
  $('kpi-receitas-sub').textContent=ls.filter(l=>l.tipo==='Recebimento').length+' lançamentos — '+MONTH_NAMES[currentMonth];
  $('kpi-despesas').textContent='R$ '+fmt(desp+invMes);
  $('kpi-despesas-sub').textContent='Gastos R$ '+fmt(desp)+' + Invest. R$ '+fmt(invMes);
  $('kpi-saldo').textContent='R$ '+fmt(Math.abs(sal));
  $('kpi-saldo').style.color=sal>=0?'var(--green)':'var(--red)';
  $('kpi-saldo-sub').textContent=sal>=0?'✅ Saldo positivo':'⚠️ Saldo negativo';
  $('kpi-inv').textContent='R$ '+fmt(invMes);
  // Gráfico anual: despesas inclui investimentos do mês
  const recM=[],despM=[];
  for(let m=0;m<12;m++){
    const l=getLancs(currentYear,m);
    const invM=investimentos.filter(i=>{if(!i.data)return false;const d=new Date(i.data+'T00:00:00');return d.getFullYear()===currentYear&&d.getMonth()===m;}).reduce((s,i)=>s+(parseFloat(i.valor)||0),0);
    recM.push(l.filter(x=>x.tipo==='Recebimento').reduce((s,x)=>s+(parseFloat(x.valor)||0),0));
    despM.push(l.filter(x=>x.tipo==='Gasto').reduce((s,x)=>s+(parseFloat(x.valor)||0),0)+invM);
  }
  if(chartAnual) chartAnual.destroy();
  chartAnual=new Chart($('chartAnual').getContext('2d'),{type:'bar',data:{labels:MONTHS,datasets:[{label:'Receitas',data:recM,backgroundColor:'rgba(34,197,94,.7)',borderRadius:5},{label:'Despesas',data:despM,backgroundColor:'rgba(239,68,68,.7)',borderRadius:5}]},options:{...cOpts(),plugins:{...cOpts().plugins,legend:{display:true,labels:{color:'#8b90a7',font:{size:11}}}}}});
  const catMap={};
  ls.filter(l=>l.tipo==='Gasto').forEach(l=>{catMap[l.categoria||'Outros']=(catMap[l.categoria||'Outros']||0)+(parseFloat(l.valor)||0);});
  const cL=Object.keys(catMap),cV=Object.values(catMap);
  const cols=['#6366f1','#22c55e','#ef4444','#f59e0b','#14b8a6','#a855f7','#ec4899','#f97316','#06b6d4','#84cc16'];
  if(chartCat) chartCat.destroy();
  chartCat=new Chart($('chartCategoria').getContext('2d'),{type:'doughnut',data:{labels:cL.length?cL:['Sem dados'],datasets:[{data:cV.length?cV:[1],backgroundColor:cL.length?cols:['#2e3147'],borderWidth:0}]},options:{...cOpts(),cutout:'65%',plugins:{legend:{position:'right',labels:{color:'#8b90a7',font:{size:11},boxWidth:12}}}}});
  const salM=[];
  for(let m=0;m<12;m++){const l=getLancs(currentYear,m);const r=l.filter(x=>x.tipo==='Recebimento').reduce((s,x)=>s+(parseFloat(x.valor)||0),0);const d=l.filter(x=>x.tipo==='Gasto').reduce((s,x)=>s+(parseFloat(x.valor)||0),0);const iM=investimentos.filter(i=>{if(!i.data)return false;const dd=new Date(i.data+'T00:00:00');return dd.getFullYear()===currentYear&&dd.getMonth()===m;}).reduce((s,i)=>s+(parseFloat(i.valor)||0),0);salM.push(r-d-iM);}
  if(chartSaldo) chartSaldo.destroy();
  chartSaldo=new Chart($('chartSaldo').getContext('2d'),{type:'line',data:{labels:MONTHS,datasets:[{label:'Saldo',data:salM,borderColor:'#6366f1',backgroundColor:'rgba(99,102,241,.1)',fill:true,tension:.4,pointBackgroundColor:salM.map(v=>v>=0?'#22c55e':'#ef4444'),pointRadius:5}]},options:{...cOpts(),plugins:{...cOpts().plugins,legend:{display:false}}}});
}
function cOpts(){return{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#1a1d27',titleColor:'#e8eaf0',bodyColor:'#8b90a7',borderColor:'#2e3147',borderWidth:1}},scales:{x:{ticks:{color:'#8b90a7',font:{size:11}},grid:{color:'#2e3147'}},y:{ticks:{color:'#8b90a7',font:{size:11},callback:v=>'R$'+fmt(v)},grid:{color:'#2e3147'}}}};}

// ── METAS ─────────────────────────────────────────────────────────────────────
function updateMetaCatSelect() {
  const cats=$('fm-tipo').value==='Recebimento'?CAT_RECEITAS:CAT_GASTOS;
  $('fm-categoria').innerHTML=cats.map(c=>`<option>${c}</option>`).join('');
}

function renderMetas() {
  const m=parseInt($('metaMes').value), ft=$('metaFilterTipo').value;
  const ls=getLancs(currentYear,m);
  let rows=metasList.filter(mt=>mt.ano===currentYear&&(mt.mes===m||mt.mes===-1));
  if(ft) rows=rows.filter(mt=>mt.tipo===ft);
  const body=$('metasBody');
  if(!rows.length){body.innerHTML=`<tr><td colspan="7"><div class="empty-state"><p>Nenhuma meta definida.<br>Clique em "+ Nova Meta".</p></div></td></tr>`;return;}
  body.innerHTML=rows.map(mt=>{
    const real=ls.filter(l=>l.tipo===mt.tipo&&l.categoria===mt.categoria).reduce((s,l)=>s+(parseFloat(l.valor)||0),0);
    const pct=mt.valor>0?Math.min(100,(real/mt.valor)*100):0;
    const bc=pct>=100?'var(--red)':pct>=75?'var(--yellow)':mt.tipo==='Recebimento'?'var(--green)':'var(--blue)';
    const sl=pct>=100?'Estourou':pct>=75?'Atenção':pct>0?'OK':'Sem uso';
    const sb=pct>=100?'badge-red':pct>=75?'badge-yellow':pct>0?'badge-green':'badge-blue';
    const tb=mt.tipo==='Recebimento'?'badge-green':'badge-red';
    return `<tr class="clickable" data-id="${mt.id}">
      <td><span class="badge ${tb}">${mt.tipo}</span></td>
      <td style="font-weight:500">${mt.categoria}</td>
      <td style="color:var(--text2)">R$ ${fmt(mt.valor)}</td>
      <td style="font-weight:600;color:${mt.tipo==='Recebimento'?'var(--green)':'var(--red)'}">R$ ${fmt(real)}</td>
      <td style="min-width:160px"><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:7px;background:var(--surface2);border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${bc};border-radius:4px"></div></div><span style="font-size:12px;color:var(--text2);min-width:36px">${pct.toFixed(0)}%</span></div></td>
      <td><span class="badge ${sb}">${sl}</span></td>
      <td class="actions-cell" style="display:flex;gap:6px">
        <button class="btn btn-edit edit-meta" data-id="${mt.id}">✏️</button>
        <button class="btn btn-danger del-meta" data-id="${mt.id}">🗑</button>
      </td></tr>`;
  }).join('');
  body.querySelectorAll('tr.clickable').forEach(tr=>tr.addEventListener('click',e=>{if(!e.target.closest('.actions-cell')) openMetaModal(parseInt(tr.dataset.id));}));
  body.querySelectorAll('.edit-meta').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openMetaModal(parseInt(b.dataset.id));}));
  body.querySelectorAll('.del-meta').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();deleteMeta(parseInt(b.dataset.id));}));
}

function openMetaModal(id) {
  editMetaId=id||null;
  $('metaModalTitle').textContent=editMetaId?'Editar Meta':'Nova Meta';
  if(editMetaId){
    const mt=metasList.find(x=>x.id===editMetaId);
    if(mt){$('fm-tipo').value=mt.tipo;updateMetaCatSelect();$('fm-categoria').value=mt.categoria;$('fm-valor').value=mt.valor;$('fm-aplicar').value=mt.mes===-1?'ano':'mes';}
  } else { $('fm-tipo').value='Gasto'; $('fm-valor').value=''; $('fm-aplicar').value='mes'; updateMetaCatSelect(); }
  openModal($('metaModal'));
}

$('fm-tipo').addEventListener('change', updateMetaCatSelect);
$('metaMes').addEventListener('change', renderMetas);
$('metaFilterTipo').addEventListener('change', renderMetas);
$('btnNovaMeta').addEventListener('click', () => openMetaModal(null));
$('btnMetaCancel').addEventListener('click', () => closeModalEl($('metaModal')));
$('btnMetaSave').addEventListener('click', saveMeta);

function saveMeta() {
  const valor=parseFloat($('fm-valor').value);
  if(!valor||valor<=0){showToast('Informe um valor válido');return;}
  const m=parseInt($('metaMes').value), mesVal=$('fm-aplicar').value==='ano'?-1:m;
  if(editMetaId){const i=metasList.findIndex(x=>x.id===editMetaId);if(i>=0) metasList[i]={...metasList[i],tipo:$('fm-tipo').value,categoria:$('fm-categoria').value,valor,mes:mesVal};}
  else metasList.push({id:nextMetaId++,ano:currentYear,mes:mesVal,tipo:$('fm-tipo').value,categoria:$('fm-categoria').value,valor});
  closeModalEl($('metaModal')); renderMetas(); showToast(editMetaId?'Meta atualizada!':'Meta adicionada!');
}

async function deleteMeta(id) {
  if(!await customConfirm('Remover esta meta?')) return;
  metasList=metasList.filter(mt=>mt.id!==id); renderMetas(); showToast('Meta removida.');
}

// ── INVESTIMENTOS ─────────────────────────────────────────────────────────────
function updateInvSelect() {
  $('fi-deonde').innerHTML=CAT_INVEST.concat(cartoes.map(c=>c.nome)).map(c=>`<option>${c}</option>`).join('');
}

function renderInv() {
  const yi=investimentos.filter(i=>!i.data||new Date(i.data+'T00:00:00').getFullYear()===currentYear);
  const total=yi.reduce((s,i)=>s+(parseFloat(i.valor)||0),0);
  const maior=yi.reduce((m,i)=>Math.max(m,parseFloat(i.valor)||0),0);
  $('inv-total').textContent='R$ '+fmt(total);
  $('inv-maior').textContent='R$ '+fmt(maior);
  $('inv-media').textContent='R$ '+fmt(total/12);
  const body=$('invBody');
  if(!investimentos.length){body.innerHTML=`<tr><td colspan="6"><div class="empty-state"><p>Nenhum investimento registrado.</p></div></td></tr>`;return;}
  body.innerHTML=investimentos.map(i=>`<tr class="clickable" data-id="${i.id}">
    <td>${fmtDate(i.data)}</td><td><span class="badge badge-blue">${i.tipo}</span></td>
    <td>${i.deonde||'—'}</td><td style="font-weight:600;color:var(--purple)">R$ ${fmt(i.valor)}</td>
    <td>${i.obs||'—'}</td>
    <td class="actions-cell"><button class="btn btn-danger del-inv" data-id="${i.id}">🗑</button></td>
  </tr>`).join('');
  body.querySelectorAll('tr.clickable').forEach(tr=>tr.addEventListener('click',e=>{if(!e.target.closest('.actions-cell')) openInvModal(parseInt(tr.dataset.id));}));
  body.querySelectorAll('.del-inv').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();deleteInv(parseInt(b.dataset.id));}));
}

function openInvModal(id) {
  editInvIdModal=id||null;
  $('invModalTitle').textContent=editInvIdModal?'Editar Investimento':'Novo Investimento';
  if(editInvIdModal){const inv=investimentos.find(x=>x.id===editInvIdModal);if(inv){$('fi-data').value=inv.data||'';$('fi-valor').value=inv.valor||'';$('fi-tipo').value=inv.tipo||'Aporte';$('fi-deonde').value=inv.deonde||'';$('fi-obs').value=inv.obs||'';}}
  else{['fi-data','fi-valor','fi-obs'].forEach(id=>$(id).value='');}
  openModal($('invModal'));
}

$('btnNovoInv').addEventListener('click', () => openInvModal(null));
$('btnInvCancel').addEventListener('click', () => closeModalEl($('invModal')));
$('btnInvSave').addEventListener('click', saveInv);

function saveInv() {
  const valor=parseFloat($('fi-valor').value);
  if(!valor||valor<=0){showToast('Informe um valor');return;}
  const obj={id:editInvIdModal||nextInvId++,data:$('fi-data').value,tipo:$('fi-tipo').value,deonde:$('fi-deonde').value,valor,obs:$('fi-obs').value};
  if(editInvIdModal){const i=investimentos.findIndex(x=>x.id===editInvIdModal);if(i>=0) investimentos[i]=obj;}
  else investimentos.push(obj);
  const wasEdit=editInvIdModal; editInvIdModal=null; closeModalEl($('invModal')); renderInv(); renderDashboard(); saveToSheets(); showToast(wasEdit?'Investimento atualizado!':'Investimento adicionado!');
}

async function deleteInv(id) {
  if(!await customConfirm('Remover este investimento?')) return;
  investimentos=investimentos.filter(i=>i.id!==id); renderInv(); renderDashboard(); saveToSheets(); showToast('Investimento removido.');
}

// ── CARTÕES ───────────────────────────────────────────────────────────────────
function updateCartaoSelect() {
  $('f-cartao').innerHTML=cartoes.map(c=>`<option>${c.nome}</option>`).join('');
}

function calcFatura(nome) {
  let t=0;
  Object.keys(lancamentos).forEach(k=>{if(parseInt(k.split('-')[0])===currentYear) lancamentos[k].filter(l=>l.tipo==='Gasto'&&l.cartao===nome).forEach(l=>t+=(parseFloat(l.valor)||0));});
  return t;
}

function renderCartoes() {
  $('cartaoBody').innerHTML=cartoes.map((c,i)=>{
    const fat=calcFatura(c.nome),pct=c.limite>0?Math.min(100,(fat/c.limite)*100):0;
    const col=pct>80?'var(--red)':pct>50?'var(--yellow)':'var(--green)';
    return `<tr><td>${i+1}</td><td style="font-weight:600">${c.nome}</td><td>R$ ${fmt(c.limite)}</td>
      <td style="color:var(--red)">R$ ${fmt(fat)}</td>
      <td><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:6px;background:var(--surface2);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${col};border-radius:3px"></div></div><span style="font-size:12px;color:var(--text2)">${pct.toFixed(0)}%</span></div></td>
      <td><button class="btn btn-danger del-cartao" data-id="${c.id}">🗑</button></td></tr>`;
  }).join('');
  $('cartaoBody').querySelectorAll('.del-cartao').forEach(b=>b.addEventListener('click',()=>deleteCartao(parseInt(b.dataset.id))));
}

$('btnNovoCartao').addEventListener('click',()=>{ $('fc-nome').value=''; $('fc-limite').value=''; openModal($('cartaoModal')); });
$('btnCartaoCancel').addEventListener('click',()=>closeModalEl($('cartaoModal')));
$('btnCartaoSave').addEventListener('click',()=>{
  const nome=$('fc-nome').value.trim();
  if(!nome){showToast('Informe o nome do cartão');return;}
  cartoes.push({id:nextCartaoId++,nome,limite:parseFloat($('fc-limite').value)||0});
  updateCartaoSelect(); updateInvSelect(); closeModalEl($('cartaoModal')); renderCartoes(); saveToSheets(); showToast('Cartão adicionado!');
});

async function deleteCartao(id) {
  if(!await customConfirm('Remover este cartão?')) return;
  cartoes=cartoes.filter(c=>c.id!==id); updateCartaoSelect(); renderCartoes(); saveToSheets(); showToast('Cartão removido.');
}

// ── OVERLAY CLOSE ─────────────────────────────────────────────────────────────
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{ if(e.target===o) o.classList.remove('open'); }));

// ── INIT ──────────────────────────────────────────────────────────────────────
function renderAll(){renderGrid();renderDashboard();renderMetas();renderInv();renderCartoes();}

$('metaMes').value = currentMonth; $('yearSelect').value = currentYear;
updateCatSelect();
updateMetaCatSelect();
updateCartaoSelect();
updateInvSelect();
buildMonthTabs();
loadFromSheets().then(() => { if (!SHEETS_URL || SHEETS_URL.includes('COLE_AQUI')) renderAll(); });
