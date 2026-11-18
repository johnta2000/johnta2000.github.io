// Read only finalized team standup summaries from the local Wispr desktop cache.
// Default to a metadata preview. --apply uses the existing internal recording upsert.
const { execFileSync } = require('node:child_process');
const { readFileSync, mkdirSync, writeFileSync, renameSync, existsSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');

const args = process.argv.slice(2);
const since = args.find(arg => /^\d{4}-\d{2}-\d{2}$/.test(arg));
if (!since || args.some(arg => arg !== since && !['--prepare', '--apply'].includes(arg))) {
  throw Error('Usage: node wispr-sync.cjs YYYY-MM-DD [--prepare | --apply]');
}
const database = join(homedir(), 'Library/Application Support/Wispr Flow/flow.sqlite');
const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function summaryHtml(summary) {
  const blocks = [];
  let bullets = [];
  const flush = () => {
    if (bullets.length) blocks.push('<ul>' + bullets.join('') + '</ul>');
    bullets = [];
  };
  for (const line of summary.split(/\r?\n/).map(text => text.trim())) {
    if (/^[-*] /.test(line)) { bullets.push('<li>' + escape(line.slice(2)) + '</li>'); continue; }
    flush();
    if (/^#{1,6}\s/.test(line)) blocks.push('<div><strong>' + escape(line.replace(/^#+\s+/, '')) + '</strong></div>');
    else if (line) blocks.push('<p>' + escape(line) + '</p>');
  }
  flush();
  return blocks.join('');
}
async function main() {
  const query = `SELECT id,title,strftime('%Y-%m-%dT%H:%M:%fZ',createdAt) AS start,summary
    FROM Meetings WHERE finalized=1 AND summaryReady=1 AND isDeleted=0 AND isTourDemo=0
    AND historyLocked=0 AND contentWithheld=0 AND trim(summary)!=''
    AND date(createdAt)>=date('${since}') AND (title LIKE 'Affil Standup%' OR title LIKE 'Affilignment%')
    ORDER BY createdAt`;
  const rows = JSON.parse(execFileSync('/usr/bin/sqlite3', ['-readonly','-json',database,query], {encoding:'utf8', maxBuffer:16*1024*1024}).trim() || '[]');
  const meetings = rows.filter(row => /^(?:Affil Standup|Affilignment)(?:\s+\d{1,4}[./-]\d{1,2}[./-]\d{1,4})?$/i.test(row.title.trim()) && row.start && localDay.format(new Date(row.start)) >= since);
  if (args.includes('--prepare')) {
    const folder = join(homedir(), 'Library/Application Support/Standups/Wispr review');
    mkdirSync(folder, { recursive:true, mode:0o700 });
    for (const row of meetings) {
      if (!/^[a-f0-9-]{36}$/i.test(row.id)) throw Error('Unexpected recording ID');
      const date = localDay.format(new Date(row.start));
      const file = join(folder, date + '-' + row.id + '.md');
      const draft = '# ' + row.title + '\n\n' + row.summary.trim() + '\n';
      if (existsSync(file) && readFileSync(file, 'utf8') === draft) continue;
      const temp = file + '.' + process.pid;
      writeFileSync(temp, draft, {mode:0o600,flag:'wx'});
      renameSync(temp, file);
      console.log(JSON.stringify({prepared:date,file}));
    }
    return;
  }
  if (!args.includes('--apply')) {
    console.log(JSON.stringify(meetings.map(row => ({date:localDay.format(new Date(row.start)),title:row.title}))));
    return;
  }
  if (!meetings.length) { console.log('No ready standups'); return; }
  const {ConvexHttpClient} = require('convex/browser');
  const config = JSON.parse(readFileSync(join(homedir(), '.convex/config.json'), 'utf8'));
  const response = await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project', {
    method:'POST', headers:{Authorization:'Bearer '+config.accessToken,'Content-Type':'application/json','Convex-Client':'npm-cli-1.41.0'},
    body:JSON.stringify({selectedDeploymentName:'rapid-shark-565',projectSelection:{kind:'teamAndProjectSlugs',teamSlug:'john-ta-af559',projectSlug:'john-ta-projects'}})
  });
  if (!response.ok) throw Error('Standups authorization failed: '+response.status);
  const credentials = await response.json();
  if (credentials.url !== 'https://rapid-shark-565.convex.cloud' || !credentials.adminKey) throw Error('Unexpected standups deployment');
  const client = new ConvexHttpClient(credentials.url,{logger:false});
  client.setAdminAuth(credentials.adminKey);
  for (const row of meetings) {
    const date = localDay.format(new Date(row.start));
    const result = await client.function('standups:upsertFathomMeetingNotes',undefined,{
      teamId:'johns-website-default',standupDate:date, meetings:[{recordingId:'wispr:'+row.id,title:row.title,startedAt:row.start,html:summaryHtml(row.summary),actionItems:[]}]
    });
    console.log(JSON.stringify({date,imported:result.imported,skipped:result.skipped}));
  }
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
