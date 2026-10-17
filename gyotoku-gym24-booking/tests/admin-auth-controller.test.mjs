import test from "node:test";
import assert from "node:assert/strict";
import { createAdminAuthController } from "../admin-auth-controller.mjs";
function fixture({ approved=true,mfa=false }={}) {
  const state={signedIn:false,approved,mfa,verified:false,rpcCalls:0,signInCalls:0,scope:null};
  const client={
    rpc:async()=>{state.rpcCalls++;return {data:state.signedIn&&state.approved&&(!state.mfa||state.verified),error:null};},
    auth:{
      signInWithPassword:async({password})=>{state.signInCalls++;if(password!=="synthetic-password")return {error:{}};state.signedIn=true;return {error:null};},
      getSession:async()=>({data:{session:state.signedIn?{access_token:"synthetic-session"}:null},error:null}),
      signOut:async({scope})=>{state.scope=scope;state.signedIn=false;return {error:null};},
      mfa:{
        listFactors:async()=>({data:{totp:state.mfa?[{id:"synthetic-factor",status:"verified"}]:[]},error:null}),
        challenge:async()=>({data:{id:"synthetic-challenge"},error:null}),
        verify:async({code})=>{state.verified=code==="123456";return {error:state.verified?null:{}};},
      },
    },
  };
  return {state,controller:createAdminAuthController(client)};
}
test("approved administrator can use the proposed minimum login without forced MFA",async()=>{
  const {controller}=fixture();assert.deepEqual(await controller.signIn({email:"admin@example.test",password:"synthetic-password"}),{ok:true});
});
test("a configured MFA requirement pauses before administrative access",async()=>{
  const {controller}=fixture({mfa:true});assert.deepEqual(await controller.signIn({email:"admin@example.test",password:"synthetic-password"}),{ok:false,challengeRequired:true});
});
test("verified MFA continues the same session without another password login",async()=>{
  const {state,controller}=fixture({mfa:true});await controller.signIn({email:"admin@example.test",password:"synthetic-password"});
  assert.deepEqual(await controller.signIn({code:"123456"}),{ok:true});assert.equal(state.signInCalls,1);
});
test("unapproved login does not gain access from credentials alone",async()=>{
  const {controller}=fixture({approved:false});await assert.rejects(controller.signIn({email:"other@example.test",password:"synthetic-password"}),/管理権限/);
});
test("invalid password stops before authorization",async()=>{
  const {state,controller}=fixture();await assert.rejects(controller.signIn({email:"admin@example.test",password:"wrong"}));assert.equal(state.rpcCalls,0);
});
test("token access is denied again after approval revocation",async()=>{
  const {state,controller}=fixture();await controller.signIn({password:"synthetic-password"});state.approved=false;await assert.rejects(controller.requireToken());
});
test("MFA input must be six digits",async()=>{
  const {controller}=fixture({mfa:true});await controller.signIn({password:"synthetic-password"});await assert.rejects(controller.signIn({code:"bad"}),/6桁/);
});
test("logout clears only the local administrator session",async()=>{
  const {state,controller}=fixture();await controller.signIn({password:"synthetic-password"});await controller.signOut();assert.equal(state.scope,"local");await assert.rejects(controller.requireToken());
});
