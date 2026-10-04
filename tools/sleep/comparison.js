/* Personal comparison UI. Receives only the signed-in owner's dashboard records. */
(function (root) {
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sources = [
    {id:'whoop',name:'WHOOP',color:'#138477',dash:''},
    {id:'eightsleep',name:'Eight Sleep',color:'#7960d5',dash:'6 3'},
    {id:'apple_health',name:'Apple Health',color:'#c36a36',dash:'2 4'},
    {id:'manual',name:'Other',color:'#66737e',dash:'8 3 2 3'},
  ];
  const metrics = [
    {id:'score',name:'Sleep scores',unit:'0–100',note:'Provider scores share an axis, but their scoring methods differ. WHOOP shows sleep performance. Only native imported scores appear; duration-derived scores are excluded.'},
    {id:'durationMinutes',name:'Time asleep',unit:'Hours',note:'Time each provider classified as asleep. Sleep detection, awake periods, and session boundaries can differ.'},
    {id:'hrv',name:'Heart rate variability',unit:'ms',note:'Provider-reported HRV. Measurement methods and sampling windows differ, so use each provider’s trend as context. WHOOP readings require recovery access and a completed sync.'},
    {id:'restingHeartRate',name:'Resting heart rate',unit:'bpm',note:'Each provider’s resting heart rate for this date. Measurement windows can differ. WHOOP readings require recovery access; other providers need these fields in an import.'},
  ];
  const dateLabel = date => new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
  const fullDate = date => new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
  const value = (row, source, metric) => row[source] ? Daylight.value(row[source],metric) : undefined;
  const format = (n, metric, source) => !finite(n) ? '—' : metric==='durationMinutes' ? Daylight.duration(n) : metric==='score' ? `${Math.round(n)}${source==='whoop'?'%':' / 100'}` : `${Math.round(n*10)/10} ${metric==='hrv'?'ms':'bpm'}`;
  class DaylightComparison {
    constructor(element) {
      this.el=element;this.hidden=new Set();this.date=null;this.pinned=false;this.geometry={};
      this.charts=element.querySelector('#comparisonCharts');this.inspector=element.querySelector('#comparisonInspector');
      this.charts.innerHTML=metrics.map(m=>`<section class="comparison-metric" data-metric="${m.id}"><div class="comparison-metric-heading"><h2>${m.name}</h2><details class="comparison-info"><summary aria-label="About ${m.name}">i</summary><p>${m.note}</p></details><span class="comparison-unit">${m.unit}</span></div><div class="comparison-readout" data-readout="${m.id}"></div><div class="comparison-plot"><svg role="img" tabindex="0" aria-label="${m.name}. Use left and right arrows to select a night, Escape to unpin."></svg><div class="comparison-tooltip" role="tooltip" hidden></div></div></section>`).join('');
      this.inspector.innerHTML='<div class="comparison-kicker">SELECTED NIGHT</div><h2 id="comparisonDate"></h2><p id="comparisonPinState"></p><div class="comparison-date-buttons"><button type="button" data-night="-1" aria-label="Previous night">←</button><button type="button" data-night="1" aria-label="Next night">→</button><button type="button" id="comparisonPin" aria-pressed="false">Pin night</button></div><section><h3>Time asleep</h3><div id="comparisonDurations"></div><p class="comparison-spread">Provider spread <strong id="comparisonSpread"></strong></p></section><section><h3>Sleep stages</h3><div id="comparisonStages"></div></section><section><h3>Readings available</h3><div id="comparisonCoverage"></div></section>';
      element.querySelectorAll('[data-night]').forEach(b=>b.onclick=()=>{this.pinned=true;this.select(this.index+Number(b.dataset.night),true);this.hideTips();});
      element.querySelector('#comparisonPin').onclick=()=>{this.pinned=!this.pinned;this.update();this.hideTips();};
      element.addEventListener('keydown',e=>{if(e.key==='Escape'){this.pinned=false;this.update();this.hideTips();}});
      this.width=0;
      new ResizeObserver(()=>{const width=this.charts.clientWidth;if(width>0&&width!==this.width){this.width=width;if(this.history)this.draw();}}).observe(this.charts);
    }
    visible(){return this.providers.filter(p=>!this.hidden.has(p.id));}
    render(nights,whoopDays,days,end) {
      this.history=Daylight.providerHistory(nights,whoopDays,days,end);
      this.providers=sources.filter(p=>p.id!=='manual'||nights.some(n=>n.source==='manual'));
      const dates=this.history.dates;
      if(!dates.includes(this.date)) this.date=dates.findLast((_,i)=>Object.keys(this.history.rows[i]).length)||dates.at(-1);
      this.index=dates.indexOf(this.date);
      const hasData=this.history.rows.some(row=>Object.keys(row).length);
      this.el.querySelector('#comparisonEmpty').hidden=hasData;
      this.el.querySelector('#comparisonProviders').innerHTML=this.providers.map(p=>`<button type="button" data-source="${p.id}" aria-pressed="${!this.hidden.has(p.id)}" style="--source-color:${p.color}"><i class="comparison-swatch" style="border-top-style:${p.id==='whoop'?'solid':p.id==='apple_health'?'dotted':'dashed'}"></i>${p.name}</button>`).join('');
      this.el.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>{this.hidden.has(b.dataset.source)?this.hidden.delete(b.dataset.source):this.hidden.add(b.dataset.source);b.setAttribute('aria-pressed',String(!this.hidden.has(b.dataset.source)));this.hideTips();this.draw();});
      this.draw();
    }
    draw() {
      if(!this.history||!this.charts.clientWidth)return;
      const count=this.history.dates.length, rows=this.history.rows;
      for(const metric of metrics){
        const section=this.charts.querySelector(`[data-metric="${metric.id}"]`), svg=section.querySelector('svg');
        const w=section.clientWidth,h=164,left=40,right=12,top=12,bottom=30;
        const all=rows.flatMap(row=>this.providers.map(p=>value(row,p.id,metric.id))).filter(finite);
        const shown=rows.flatMap(row=>this.visible().map(p=>value(row,p.id,metric.id))).filter(finite);
        let low=0,high=100,ticks=[0,25,50,75,100];
        if(metric.id!=='score'){
          const min=all.length?Math.min(...all):0,max=all.length?Math.max(...all):metric.id==='durationMinutes'?600:metric.id==='hrv'?100:80;
          const pad=Math.max((max-min)*.2,metric.id==='durationMinutes'?30:5);
          const step=metric.id==='durationMinutes'?Math.max(60,Math.ceil((max-min+pad*2)/4/60)*60):Math.max(5,Math.ceil((max-min+pad*2)/4/5)*5);
          low=Math.max(0,Math.floor((min-pad)/step)*step);high=Math.ceil((max+pad)/step)*step;
          ticks=Array.from({length:Math.round((high-low)/step)+1},(_,i)=>low+i*step);
        }
        const x=i=>left+i/(count-1)*(w-left-right),y=v=>h-bottom-(v-low)/(high-low)*(h-top-bottom);
        this.geometry[metric.id]={x,y,w,h,left,right};
        const tickCount=w<400?3:count===7?7:5;
        const indices=[...new Set(Array.from({length:tickCount},(_,i)=>Math.round(i*(count-1)/(tickCount-1))))];
        let markup=ticks.map(v=>`<line x1="${left}" x2="${w-right}" y1="${y(v)}" y2="${y(v)}" class="comparison-grid"/><text x="${left-8}" y="${y(v)+4}" text-anchor="end">${metric.id==='durationMinutes'?`${Math.round(v/60*10)/10}h`:v}</text>`).join('');
        markup+=indices.map((i,j)=>`<text x="${x(i)}" y="${h-6}" text-anchor="${j===0?'start':j===indices.length-1?'end':'middle'}">${dateLabel(this.history.dates[i])}</text>`).join('');
        for(const p of this.visible()){
          let open=false;const path=rows.map((row,i)=>{const n=value(row,p.id,metric.id);if(!finite(n)){open=false;return '';}const command=open?'L':'M';open=true;return `${command}${x(i)},${y(n)}`;}).join(' ');
          markup+=`<path d="${path}" fill="none" stroke="${p.color}" stroke-width="2" stroke-dasharray="${p.dash}"/>`;
          // Keep a single imported night visible, even when there is no line segment.
          markup+=rows.map((row,i)=>{const n=value(row,p.id,metric.id);return finite(n)?`<circle cx="${x(i)}" cy="${y(n)}" r="${count>28?1.5:2.5}" fill="${p.color}"/>`:'';}).join('');
        }
        if(!shown.length) markup+=`<text x="${(left+w-right)/2}" y="${h/2}" text-anchor="middle" class="comparison-no-data">${this.visible().length?'No readings in this range':'Choose a provider above'}</text>`;
        markup+='<line class="comparison-guide"/><g class="comparison-markers"></g>';
        markup+=`<rect class="comparison-hit" x="${left}" y="0" width="${w-left-right}" height="${h-bottom}" fill="transparent"/>`;
        svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('height',h);svg.innerHTML=markup;
        const hit=svg.querySelector('.comparison-hit');
        const pick=e=>{const rect=svg.getBoundingClientRect(),px=(e.clientX-rect.left)*w/rect.width;return {px,index:Math.max(0,Math.min(count-1,Math.round((px-left)/(w-left-right)*(count-1))))};};
        hit.onpointermove=e=>{if(this.pinned||e.pointerType==='touch')return;const hit=pick(e);this.select(hit.index);this.tip(metric,hit.px);};
        hit.onpointerleave=()=>this.hideTips();
        hit.onclick=e=>{const hit=pick(e);this.pinned=!(this.pinned&&this.index===hit.index);this.select(hit.index,true);this.tip(metric,hit.px);};
        svg.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();this.pinned=true;this.select(e.key==='Home'?0:e.key==='End'?count-1:this.index+(e.key==='ArrowLeft'?-1:1),true);this.tip(metric,x(this.index));};
      }
      this.update();
    }
    select(index,announce=false){this.index=Math.max(0,Math.min(this.history.dates.length-1,index));this.date=this.history.dates[this.index];this.update();if(announce)this.el.querySelector('#comparisonAnnouncement').textContent=`${fullDate(this.date)} selected${this.pinned?', pinned':''}.`;}
    update(){
      if(!this.history)return;
      const row=this.history.rows[this.index],ps=this.visible();
      this.el.querySelector('#comparisonDate').textContent=fullDate(this.date);
      this.el.querySelector('#comparisonPinState').textContent=this.pinned?'Pinned · click again to release':'Following your cursor';
      const pin=this.el.querySelector('#comparisonPin');pin.textContent=this.pinned?'Unpin':'Pin night';pin.setAttribute('aria-pressed',String(this.pinned));
      this.el.querySelector('[data-night="-1"]').disabled=this.index===0;this.el.querySelector('[data-night="1"]').disabled=this.index===this.history.dates.length-1;
      for(const metric of metrics){
        const section=this.charts.querySelector(`[data-metric="${metric.id}"]`),g=this.geometry[metric.id];if(!g)continue;
        section.querySelector('.comparison-unit').textContent=`${dateLabel(this.date)} · ${metric.unit}`;
        section.querySelector('.comparison-readout').innerHTML=ps.map(p=>`<span style="--source-color:${p.color}"><i></i><span class="comparison-provider-name">${p.name}</span><strong>${format(value(row,p.id,metric.id),metric.id,p.id)}</strong></span>`).join('');
        const guide=section.querySelector('.comparison-guide');guide.setAttribute('x1',g.x(this.index));guide.setAttribute('x2',g.x(this.index));guide.setAttribute('y1',12);guide.setAttribute('y2',g.h-30);
        section.querySelector('.comparison-markers').innerHTML=ps.map(p=>{const n=value(row,p.id,metric.id);return finite(n)?`<circle cx="${g.x(this.index)}" cy="${g.y(n)}" r="4.5" fill="${p.color}" stroke="white" stroke-width="2"/>`:'';}).join('');
      }
      const durations=ps.map(p=>value(row,p.id,'durationMinutes')).filter(finite),max=Math.max(1,...durations);
      this.el.querySelector('#comparisonDurations').innerHTML=ps.map(p=>{const n=value(row,p.id,'durationMinutes');return `<div class="comparison-value" style="--source-color:${p.color}"><i></i>${p.name}<strong>${format(n,'durationMinutes',p.id)}</strong></div>${finite(n)?`<div class="comparison-bar"><span style="width:${n/max*100}%;background:${p.color}"></span></div>`:''}`;}).join('');
      this.el.querySelector('#comparisonSpread').textContent=durations.length>1?`${Math.round(Math.max(...durations)-Math.min(...durations))} min`:'—';
      this.el.querySelector('#comparisonStages').innerHTML=ps.map(p=>{
        const stages=Daylight.stages(row[p.id]);if(!stages)return '';
        return `<div class="comparison-stage-source"><h4>${p.name}</h4><div class="comparison-stage-bar">${stages.map((s,i)=>`<button type="button" style="flex:${s.minutes};background:${p.color};opacity:${[.4,1,.7][i]}" aria-label="${p.name} ${s.label}: ${Daylight.duration(s.minutes)}" data-stage-label="${escape(`${p.name} · ${s.label}: ${Daylight.duration(s.minutes)}`)}"></button>`).join('')}</div><div class="comparison-stage-labels">${stages.map(s=>`<span>${s.label}<b>${Daylight.duration(s.minutes)}</b></span>`).join('')}</div>`;
      }).join('')||'<p class="comparison-missing">No stage breakdown for this night.</p>';
      this.el.querySelector('#comparisonStages').insertAdjacentHTML('beforeend','<p id="comparisonStageDetail" class="comparison-missing">Provider estimates</p>');
      this.el.querySelectorAll('[data-stage-label]').forEach(b=>{const show=()=>this.el.querySelector('#comparisonStageDetail').textContent=b.dataset.stageLabel;b.onpointerenter=show;b.onfocus=show;b.onclick=show;});
      this.el.querySelector('#comparisonCoverage').innerHTML=ps.map(p=>`<p class="comparison-coverage">${p.name}<span>${metrics.filter(m=>finite(value(row,p.id,m.id))).length} / 4 metrics</span></p>`).join('');
    }
    hideTips(){this.el.querySelectorAll('.comparison-tooltip').forEach(t=>t.hidden=true);}
    tip(metric,px){
      this.hideTips();const row=this.history.rows[this.index],g=this.geometry[metric.id],tip=this.charts.querySelector(`[data-metric="${metric.id}"] .comparison-tooltip`);
      tip.innerHTML=`<strong>${fullDate(this.date)}${this.pinned?' · Pinned':''}</strong><span class="comparison-tip-metric">${metric.name}</span>${this.visible().map(p=>`<div class="comparison-value" style="--source-color:${p.color}"><i></i>${p.name}<strong>${format(value(row,p.id,metric.id),metric.id,p.id)}</strong></div>`).join('')}${metric.id==='score'?'<p>WHOOP: sleep performance · Other sources: native sleep score</p>':''}`;
      tip.hidden=false;const width=tip.offsetWidth;tip.style.left=`${Math.max(0,Math.min(g.w-width,px>g.w/2?px-width-12:px+12))}px`;
    }
  }
  root.DaylightComparison=DaylightComparison;
})(window);
