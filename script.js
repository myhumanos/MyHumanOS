document.getElementById('year').textContent = new Date().getFullYear();

const types = [
  {name:'Generator', strategy:'Respond, then commit', authority:'Sacral clarity', vibe:'Your energy grows when you stop chasing and start responding to what is actually alive in front of you.'},
  {name:'Manifesting Generator', strategy:'Respond, then inform', authority:'Sacral clarity', vibe:'You are built for speed, experiments and nonlinear paths. Let life give you something real to respond to first.'},
  {name:'Projector', strategy:'Wait for recognition', authority:'Emotional clarity', vibe:'Your gift is seeing systems. Do not force access. Let the right people invite your perspective.'},
  {name:'Manifestor', strategy:'Inform before initiating', authority:'Splenic impulse', vibe:'You move energy by initiating. Peace comes when you communicate before you disrupt the room.'},
  {name:'Reflector', strategy:'Wait a lunar cycle', authority:'Lunar/environmental clarity', vibe:'You are not here to be consistent. You are here to sample life and reveal the truth of the environment.'}
];
const profiles = ['1/3 Investigator · Martyr','1/4 Investigator · Opportunist','2/4 Hermit · Opportunist','2/5 Hermit · Heretic','3/5 Martyr · Heretic','3/6 Martyr · Role Model','4/6 Opportunist · Role Model','4/1 Opportunist · Investigator','5/1 Heretic · Investigator','5/2 Heretic · Hermit','6/2 Role Model · Hermit','6/3 Role Model · Martyr'];
const centers = ['Head','Ajna','Throat','G','Heart','Sacral','Spleen','Solar Plexus','Root'];
const gateThemes = ['Self-expression','Stillness','Beginnings','Direction','Patience','Friction','Leadership','Contribution','Focus','Behavior','Peace','Caution','Listening','Grace','Extremes','Skills','Opinions','Correction','Wanting','Contemplation','Biting Through','Grace','Splitting Apart','Return','Innocence','Taming Power','Nourishment','Preponderance','The Abysmal','The Clinging','Influence','Duration','Retreat','Power','Progress','Darkening','Family','Opposition','Obstruction','Deliverance','Decrease','Increase','Breakthrough','Coming to Meet','Gathering','Pushing Up','Oppression','The Well','Revolution','The Cauldron','Shock','Keeping Still','Development','Marrying Maiden','Abundance','The Wanderer','Gentle Wind','Joy','Dispersion','Limitation','Inner Truth','Small Exceeding','After Completion','Before Completion'];
function hash(str){let h=2166136261; for(let i=0;i<str.length;i++){h^=str.charCodeAt(i); h=Math.imul(h,16777619)} return Math.abs(h);}
function pick(arr, seed, off=0){return arr[(seed+off)%arr.length];}
function uniqueGates(seed){let out=[]; let x=seed; while(out.length<8){x = (x*9301+49297)%233280; let g=(x%64)+1; if(!out.includes(g)) out.push(g);} return out;}
const form = document.getElementById('chartForm');
const result = document.getElementById('chartResult');
form.addEventListener('submit', (e)=>{
  e.preventDefault();
  const name=document.getElementById('name').value.trim();
  const date=document.getElementById('date').value;
  const time=document.getElementById('time').value;
  const place=document.getElementById('place').value.trim();
  const seed=hash(`${name}|${date}|${time}|${place}`);
  const type=pick(types,seed); const profile=pick(profiles,seed,3);
  const gates=uniqueGates(seed); const defined=centers.filter((_,i)=>((seed>>i)&1)).slice(0,5);
  const openness=centers.filter(c=>!defined.includes(c));
  result.classList.remove('empty');
  result.innerHTML = `
    <span class="result-kicker">Launch chart preview</span>
    <h3>${name || 'Your'} · ${type.name}</h3>
    <div class="result-grid">
      <div><span>Profile</span><strong>${profile}</strong></div>
      <div><span>Strategy</span><strong>${type.strategy}</strong></div>
      <div><span>Authority</span><strong>${type.authority}</strong></div>
      <div><span>Place</span><strong>${place}</strong></div>
    </div>
    <p class="guidance">${type.vibe}</p>
    <div class="mini-section"><span>Active gate preview</span><div class="gate-list">${gates.map(g=>`<b>Gate ${g}<small>${gateThemes[g-1]}</small></b>`).join('')}</div></div>
    <div class="mini-section"><span>Defined centers preview</span><p>${defined.length ? defined.join(' · ') : 'No fixed center preview'}</p></div>
    <div class="mini-section"><span>Open centers preview</span><p>${openness.slice(0,5).join(' · ')}</p></div>
    <p class="disclaimer">This is a deterministic website prototype, not a final Swiss Ephemeris Human Design calculation yet. It makes the chart flow work for launch/testing.</p>
  `;
});