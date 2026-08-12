(()=>{
  // iPhone/Safari で Supabase 通信が一時的に `TypeError: Load failed` になる場合だけ自動再試行する。
  // 予約ルールやデータ処理は変更せず、通信失敗時の管理画面起動を安定させる。
  const originalRpc=window.rpc;
  if(typeof originalRpc!=='function')return;

  const isTransientNetworkError=error=>{
    const message=String(error?.message||error||'').toLowerCase();
    return message.includes('load failed')||message.includes('failed to fetch')||message.includes('network')||message.includes('fetch');
  };
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  window.rpc=async function(name,args){
    let lastError;
    for(let attempt=0;attempt<3;attempt++){
      try{
        return await originalRpc(name,args);
      }catch(error){
        lastError=error;
        if(!isTransientNetworkError(error)||attempt===2)throw error;
        await wait(attempt===0?350:900);
      }
    }
    throw lastError;
  };
})();
