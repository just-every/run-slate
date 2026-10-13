import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {readRuntimeConfig,RuntimeConfigurationError} from '../../src/core/platform/config/runtime';
import {readLaunchProfile,isFlagshipPath,isFlagshipJob} from '../../src/core/platform/config/launch-profile';
import {LaunchProfileContext} from '../../src/core/app/ui/LaunchProfile';
import {DecisionCard, type Decision} from '../../src/core/features/decisions/ui/PageDecisions';
import {InlineToolbar} from '../../src/core/features/editor/ui/InlineToolbar';

test('FLAG-001 — deployment and runtime default to core wiki and reject misspelled profiles',()=>{
  const local={LOCAL_DEVELOPMENT:'true',APP_URL:'http://127.0.0.1:8787',SETUP_OWNER_EMAIL:'owner@test.invalid',MAIL_PROVIDER:'development',MAIL_FROM:'slate@test.invalid',SESSION_SECRET:'profile-test-only'};
  assert.equal(readLaunchProfile(),'core-wiki');
  assert.equal(readRuntimeConfig(local,true).launchProfile,'core-wiki');
  assert.equal(readRuntimeConfig({...local,SLATE_PROFILE:'flagship'},true).launchProfile,'flagship');
  assert.throws(()=>readRuntimeConfig({...local,SLATE_PROFILE:'core'},true),RuntimeConfigurationError);

});
test('FLAG-001 — prefix matching cannot block core paths or permit flagship descendants',()=>{
  for(const path of ['/api/runs','/api/runs/123/resume','/api/%72uns','/api/agent/mcp','/api/collaboration/page/socket','/app/inquiries/id','/app/runs/id']) assert.equal(isFlagshipPath(path),true,path);
  for(const path of ['/api/pages','/api/runs-extra','/api/search','/api/exports/workspace','/api/imports','/api/decisions','/api/collaboration/page','/api/collaboration/page/presence']) assert.equal(isFlagshipPath(path),false,path);
  assert.equal(isFlagshipJob({kind:'intelligence.run'}),true);
  assert.equal(isFlagshipJob({kind:'federation.refresh'}),true);
  assert.equal(isFlagshipJob({kind:'core.health'}),false);
});
test('FLAG-001 — selection toolbar keeps formatting and comments with Ask absent until explicit flagship context',()=>{
  const noop=()=>{};
  const toolbar=<InlineToolbar activeMarks={[]} canEdit onToggleMark={noop} onColour={noop} onLink={noop} onComment={noop} onAskAi={noop}/>;
  const core=renderToStaticMarkup(toolbar);
  assert.match(core,/Comment/);assert.match(core,/Add a link/);assert.doesNotMatch(core,/Ask AI/);
  const flagship=renderToStaticMarkup(<LaunchProfileContext.Provider value="flagship">{toolbar}</LaunchProfileContext.Provider>);
  assert.match(flagship,/Ask AI/);assert.match(flagship,/Comment/);
});

test('FLAG-001 — manual decisions retain review and replacement controls while impact rehearsal is disabled',()=>{
  const decision:Decision={id:'decision',page_id:'page',question:'Question',outcome:'Outcome',rationale:'Reason',owner_member_id:'owner',state:'accepted',revision_id:'revision',review_at:null,decided_at:null,overdue:false,citationsCurrent:true,superseded_by_decision_id:null,content:{options:['Option'],citations:[{kind:'page',sourceId:'page',revisionId:'prior'}]}};
  const card=<DecisionCard decision={decision} siblings={[]} reload={()=>{}} currentRevisionId="current"/>;
  const core=renderToStaticMarkup(card);
  assert.match(core,/Record a review/);assert.match(core,/Prepare a replacement decision/);assert.doesNotMatch(core,/Rehearse the impact/);
  const flagship=renderToStaticMarkup(<LaunchProfileContext.Provider value="flagship">{card}</LaunchProfileContext.Provider>);
  assert.match(flagship,/Rehearse the impact/);
});
