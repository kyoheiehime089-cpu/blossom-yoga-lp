// 会員画面「自分の予約」：予約日時が新しいものを上に表示する。
// 予約ルール・次回予約・プラン設定は変更しない。
(function(){
  window.renderMine=function(){
    const list=[...(snapshot?.reservations||[])].sort((a,b)=>startAt(b.date,b.start_minute)-startAt(a.date,a.start_minute));
    $('#mine').innerHTML=list.length?list.map(reservationItem).join(''):'<article class="res"><p>現在、予約はありません。</p></article>';
  };
})();