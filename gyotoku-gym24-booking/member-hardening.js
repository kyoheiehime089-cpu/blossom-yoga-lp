// 23:50開始まで10分単位で表示し、日付またぎ時刻を正しく表示
(function(){
  const timeLabel=value=>{const minute=Number(value);if(minute<1440)return `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;const next=minute-1440;return `翌${Math.floor(next/60)}:${String(next%60).padStart(2,'0')}`;};
  window.slotRange=function(startMinute){return `${timeLabel(startMinute)}〜${timeLabel(Number(startMinute)+Number(rule().use_minutes))}`;};
  window.allStarts=function(){const values=[];for(let minute=0;minute<=1430;minute+=10)values.push(minute);return values;};
  const originalRule=window.rule;
  window.rule=function(){const result=originalRule();if(result.plan_code==='standard')result.concurrent_limit=Number(result.concurrent_limit||2);return result;};
})();