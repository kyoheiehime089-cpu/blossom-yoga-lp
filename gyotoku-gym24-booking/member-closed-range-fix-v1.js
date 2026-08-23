// 会員画面：管理者が一括で設定した利用不可時間を、実際の block_minutes で正しく判定する。
// 予約ルールや他の競合判定は変更しない。
function closed(date,start){
  const candidateStart=Number(start);
  const candidateEnd=candidateStart+Number(rule().use_minutes);
  return (snapshot?.closed_slots||[]).find(item=>{
    if(item.date!==date)return false;
    const blockStart=Number(item.start_minute)-10;
    const blockEnd=Number(item.start_minute)+Number(item.block_minutes||50)+10;
    return overlaps(candidateStart,candidateEnd,blockStart,blockEnd);
  });
}
