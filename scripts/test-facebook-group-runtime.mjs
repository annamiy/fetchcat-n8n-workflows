// Credential-free integration test: all paid/service nodes are replaced with stubs.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const dir=new URL('../workflows/facebook-group-research-shortlist/',import.meta.url);
const workflow=JSON.parse(fs.readFileSync(new URL('workflow.json',dir)));
workflow.id='fcFbLocal14869';workflow.name='FetchCat local synthetic APIA-14869';
workflow.nodes=workflow.nodes.filter(n=>n.type!=='n8n-nodes-base.stickyNote');
workflow.nodes.find(n=>n.type==='n8n-nodes-base.set').parameters.assignments.assignments.find(a=>a.name==='sheetId').value='synthetic_sheet_id_for_fixture_only';
for (const n of workflow.nodes){
let jsCode;
if(n.type==='@apify/n8n-nodes-apify.apify')jsCode='return '+JSON.stringify(JSON.parse(fs.readFileSync(new URL('fixtures/input.json',dir))).items)+'.map(json=>({json}));';
if(n.type==='@n8n/n8n-nodes-langchain.openAi')jsCode=`return [{json:{text:JSON.stringify({assessments:JSON.parse($input.first().json.payload).groups.map(g=>({url:g.url,fit:'relevant',quote:'gardening',unknowns:'Location unverified.'}))})}}];`;
if(n.type==='n8n-nodes-base.googleSheets')jsCode='return $input.all();';
if(jsCode){n.type='n8n-nodes-base.code';n.typeVersion=2;n.parameters={jsCode};delete n.onError;}
}
if(workflow.nodes.some(n=>/apify|openAi|googleSheets/.test(n.type)))throw new Error('Service node was not stubbed.');
const cli=args=>execFileSync('sudo',['-n','/usr/local/sbin/fetchcat-n8n-cli',...args],{encoding:'utf8',maxBuffer:64*1024*1024});
execFileSync('sudo',['-n','/usr/local/sbin/fetchcat-n8n-cli','import'],{input:JSON.stringify(workflow),stdio:['pipe','pipe','inherit']});
const output=cli(['execute','--id='+workflow.id,'--runner-port='+(process.env.N8N_CLI_RUNNER_PORT||'5688')]);
const result=JSON.parse(output.slice(output.indexOf('{\n  "data"')));
const data=result.data.resultData;
if(data.error)throw new Error(data.error.message);
const outcome=data.runData['Report saved research outcome']?.[0].data.main[0][0].json;
if(outcome?.groups!==1||outcome?.shortlisted!==1)throw new Error('Expected saved synthetic outcome: '+JSON.stringify(outcome));
console.log('PASS: actual n8n JS sandbox, all processing nodes, synthetic AI and destination stubs; no paid calls or real sheet writes.');
