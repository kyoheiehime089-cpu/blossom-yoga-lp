(()=>{
  const HOL=['2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23'];
  function correctedBlocks(d){
    const day=new Date(d+'T00:00:00').getDay();
    if(HOL.includes(d)) return [[510,820]];
    if(day===1) return [[510,610],[1080,1330]];
    if(day===2) return [[510,610],[750,790],[1080,1330]];
    if(day===3) return [[1080,1330]];
    if(day===4) return [[690,790],[1215,1315]];
    if(day===5) return [[1080,1330]];
    if(day===6||day===0) return [[460,820]];
    return [];
  }
  window.fsProgramBlocksV44=correctedBlocks;
  try{ window.blocks=correctedBlocks; blocks=correctedBlocks; }catch(e){}
})();
