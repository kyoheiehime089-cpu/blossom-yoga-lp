// 会員画面：前後10分・入退室5分の案内文だけを全プランで非表示にする。
// 予約競合判定や前後10分の内部ルール自体は変更しない。
(function(){
  const TARGETS=[
    '前後の空き時間：',
    '利用時間の前後10分を確保します。',
    '入室は5分前以降、退出は終了後5分以内です。'
  ];

  function removeBufferRule(){
    document.querySelectorAll('.rules p').forEach(paragraph=>{
      const text=(paragraph.textContent||'').replace(/\s+/g,'').trim();
      if(TARGETS.some(target=>text.includes(target.replace(/\s+/g,'')))){
        paragraph.remove();
      }
    });
  }

  const originalRender=window.render;
  if(typeof originalRender==='function'){
    window.render=function(){
      originalRender.apply(this,arguments);
      removeBufferRule();
    };
  }

  document.addEventListener('DOMContentLoaded',removeBufferRule);
  new MutationObserver(removeBufferRule).observe(document.documentElement,{childList:true,subtree:true});
})();
