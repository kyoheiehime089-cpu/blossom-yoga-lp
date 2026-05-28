(()=>{
  const $=q=>document.querySelector(q);
  let timer=null;
  function ensureToast(){
    let t=$('#adminSoftToast');
    if(t)return t;
    const style=document.createElement('style');
    style.textContent=`#adminSoftToast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(20px);background:#1f2a24;color:#fff;padding:12px 18px;border-radius:999px;font-weight:900;box-shadow:0 18px 40px rgba(0,0,0,.22);opacity:0;pointer-events:none;z-index:99999;transition:.25s ease;max-width:calc(100% - 32px);text-align:center}#adminSoftToast.show{opacity:1;transform:translateX(-50%) translateY(0)}`;
    document.head.appendChild(style);
    t=document.createElement('div');
    t.id='adminSoftToast';
    document.body.appendChild(t);
    return t;
  }
  function show(msg){
    const t=ensureToast();
    t.textContent=msg;
    t.classList.add('show');
    clearTimeout(timer);
    timer=setTimeout(()=>t.classList.remove('show'),2200);
  }
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-copy-login]')){
      setTimeout(()=>show('LINE文面をコピーしました'),120);
    }
  });
  document.addEventListener('submit',e=>{
    const edit=e.target.closest('#editMember');
    if(edit){
      setTimeout(()=>show('会員情報を保存しました'),900);
    }
  });
  window.adminSoftToast=show;
})();