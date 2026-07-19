(() => {
  const KEY = 'fs_admin_saved_pass';
  const $ = (q) => document.querySelector(q);
  const shown = (el) => el && !el.classList.contains('hidden');
  function input(){ return $('#adminPass'); }
  function fill(){ const el=input(); if(!el) return false; const v=localStorage.getItem(KEY)||''; if(v && !el.value) el.value=v; return !!v; }
  function save(){ const v=(input()?.value||'').trim(); if(v) localStorage.setItem(KEY,v); }
  function clear(){ localStorage.removeItem(KEY); const el=input(); if(el) el.value=''; alert('保存したログイン情報を削除しました'); }
  function button(){ const el=input(); const box=el?.closest('.panel')||el?.parentElement; if(!box||$('#clearAdminSavedLogin')) return; const b=document.createElement('button'); b.id='clearAdminSavedLogin'; b.type='button'; b.className='ghost'; b.style.marginTop='8px'; b.textContent='保存したログイン情報を削除'; b.addEventListener('click',clear); box.appendChild(b); }
  window.addEventListener('DOMContentLoaded',()=>{ button(); fill(); const view=$('#adminView'); if(view){ new MutationObserver(()=>{ if(shown(view)) save(); }).observe(view,{attributes:true,attributeFilter:['class']}); } $('#adminOpen')?.addEventListener('click',()=>setTimeout(()=>{ if(shown($('#adminView'))) save(); },600)); setTimeout(()=>{ if(fill()&&!shown($('#adminView'))) $('#adminOpen')?.click(); },250); });
})();
