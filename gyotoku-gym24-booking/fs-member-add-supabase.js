const fsdb = window.supabase.createClient(window.FRIENDS_SUPABASE_URL, window.FRIENDS_SUPABASE_ANON_KEY);
const FS_URL='https://kyoheiehime089-cpu.github.io/blossom-yoga-lp/friends-serufu-member-booking-app/';
async function fsRpc(name,args){const {data,error}=await fsdb.rpc(name,args);if(error)return {ok:false,error:error.message};return data||{ok:false,error:'応答がありません'};}
function fsLoginUrl(m){return FS_URL+'?'+new URLSearchParams({mid:m.member_code,pin:m.pin}).toString();}
function fsLine(m){return `friendsセルフの会員登録が完了しました。\n\n下記URLから予約画面にログインしてください。\n\n【会員用URL】\n${fsLoginUrl(m)}\n\n【会員ID】\n${m.member_code}\n\n【ログインPIN】\n${m.pin}\n\n【プラン】\n${m.plan}\n\n予約は2週間先まで可能です。\n同時に確保できる予約は最大2枠までです。`;}
async function fsCopy(t){try{await navigator.clipboard.writeText(t);alert('コピーしました')}catch(e){prompt('コピーしてください',t)}}
document.addEventListener('DOMContentLoaded',()=>{
 let admin='';
 const login=document.getElementById('login'), app=document.getElementById('app'), pass=document.getElementById('pass');
 document.getElementById('open').onclick=()=>{admin=pass.value;login.classList.add('hidden');app.classList.remove('hidden')};
 document.getElementById('form').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const r=await fsRpc('fs_admin_create_member',{p_admin_password:admin,p_name:String(fd.get('name')).trim(),p_email:String(fd.get('email')).trim(),p_plan:String(fd.get('plan')).trim()});if(!r.ok){alert(r.error);return}const m=r.member;document.getElementById('result').classList.remove('hidden');document.getElementById('rid').textContent=m.member_code;document.getElementById('rpin').textContent=m.pin;document.getElementById('message').value=fsLine(m);e.currentTarget.reset();document.getElementById('result').scrollIntoView({behavior:'smooth'});};
 document.getElementById('copy').onclick=()=>fsCopy(document.getElementById('message').value);
});