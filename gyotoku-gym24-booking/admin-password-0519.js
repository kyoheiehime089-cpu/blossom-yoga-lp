(()=>{
  const LOGIN_PASSWORD='0519';
  const SERVER_PASSWORD='1111';

  if(typeof openAdmin!=='function') return;

  openAdmin=async function(){
    const input=document.querySelector('#adminPass');
    const entered=String(input?.value||'').trim();
    if(entered!==LOGIN_PASSWORD){
      alert('管理者パスコードが違います。');
      return;
    }

    adminPassword=SERVER_PASSWORD;
    await loadSnapshot();
    sessionStorage.removeItem('gyotoku_admin_password');
    if(input) input.value=LOGIN_PASSWORD;
    document.querySelector('#loginView')?.classList.add('hidden');
    document.querySelector('#adminView')?.classList.remove('hidden');
  };
})();
