(function(){
  const MEMBER_CODE_KEY='gyotoku_member_code';
  const MEMBER_PIN_KEY='gyotoku_member_pin';
  const MEMBER_AUTO_KEY='gyotoku_member_auto_login';
  const ADMIN_PASS_KEY='gyotoku_admin_saved_password';
  const ADMIN_AUTO_KEY='gyotoku_admin_auto_login';

  function addMemberAutoLogin(){
    const form=document.querySelector('#loginForm');
    if(!form||document.querySelector('#memberAutoLogin'))return;
    const row=document.createElement('label');
    row.style.display='flex';row.style.gap='10px';row.style.alignItems='flex-start';row.style.margin='14px 0';row.style.fontWeight='700';row.style.lineHeight='1.5';
    row.innerHTML='<input id="memberAutoLogin" type="checkbox" style="width:20px;height:20px;margin-top:2px" checked><span>この端末では次回から自動ログインする<br><small style="font-weight:500;color:var(--muted)">ホーム画面のアプリを開くだけで予約画面を表示します。</small></span>';
    const button=form.querySelector('button[type="submit"],button.btn');
    form.insertBefore(row,button);
    const saved=localStorage.getItem(MEMBER_AUTO_KEY);
    row.querySelector('input').checked=saved!=='false';
    form.addEventListener('submit',()=>{
      const enabled=row.querySelector('input').checked;
      localStorage.setItem(MEMBER_AUTO_KEY,String(enabled));
      if(!enabled){setTimeout(()=>{localStorage.removeItem(MEMBER_CODE_KEY);localStorage.removeItem(MEMBER_PIN_KEY);},800);}
    },true);
    const logout=document.querySelector('#logout');
    logout?.addEventListener('click',()=>{localStorage.removeItem(MEMBER_CODE_KEY);localStorage.removeItem(MEMBER_PIN_KEY);localStorage.setItem(MEMBER_AUTO_KEY,'false');});
  }

  function addAdminAutoLogin(){
    const pass=document.querySelector('#adminPass');
    const open=document.querySelector('#adminOpen');
    if(!pass||!open||document.querySelector('#adminAutoLogin'))return;
    const row=document.createElement('label');
    row.style.display='flex';row.style.gap='10px';row.style.alignItems='flex-start';row.style.margin='14px 0';row.style.fontWeight='700';row.style.lineHeight='1.5';
    row.innerHTML='<input id="adminAutoLogin" type="checkbox" style="width:20px;height:20px;margin-top:2px" checked><span>この端末では次回から自動ログインする<br><small style="font-weight:500;color:var(--muted)">管理者アプリを開くだけで管理画面を表示します。共有端末ではチェックを外してください。</small></span>';
    open.parentElement?.insertAdjacentElement('afterend',row);
    const checkbox=row.querySelector('input');
    checkbox.checked=localStorage.getItem(ADMIN_AUTO_KEY)!=='false';
    const saveAfterLogin=()=>setTimeout(()=>{
      const loggedIn=!document.querySelector('#adminView')?.classList.contains('hidden');
      if(loggedIn&&checkbox.checked&&pass.value){localStorage.setItem(ADMIN_PASS_KEY,pass.value);localStorage.setItem(ADMIN_AUTO_KEY,'true');}
      else if(!checkbox.checked){localStorage.removeItem(ADMIN_PASS_KEY);localStorage.setItem(ADMIN_AUTO_KEY,'false');}
    },900);
    open.addEventListener('click',saveAfterLogin);
    const savedPass=localStorage.getItem(ADMIN_PASS_KEY);
    if(savedPass&&checkbox.checked&&!sessionStorage.getItem('gyotoku_admin_password')){
      pass.value=savedPass;
      setTimeout(()=>open.click(),150);
    }
    checkbox.addEventListener('change',()=>{
      localStorage.setItem(ADMIN_AUTO_KEY,String(checkbox.checked));
      if(!checkbox.checked)localStorage.removeItem(ADMIN_PASS_KEY);
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{addMemberAutoLogin();addAdminAutoLogin();});
})();