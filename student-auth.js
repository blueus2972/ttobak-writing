import {client,assertConfigured} from './cloud-client.js';
export async function studentPasswordAuth(action,name,password,classCode){
 assertConfigured();
 const {data:{session}}=await client.auth.getSession();
 if(!session){const anonymous=await client.auth.signInAnonymously();if(anonymous.error)throw new Error('학생 접속 세션을 만들지 못했어요. 잠시 후 다시 시도해 주세요.');}
 const {data,error}=await client.functions.invoke('student-account',{body:{action,name,password,...(action==='register'?{classCode}: {})}});
 if(error){let message='로그인하지 못했어요. 이름과 비밀번호를 확인해 주세요.';try{const detail=await error.context?.json();if(detail?.error)message=detail.error}catch{}throw new Error(message)}
 if(data?.error)throw new Error(data.error);
 if(!data?.access_token||!data?.refresh_token)throw new Error('로그인 정보를 받지 못했어요.');
 const result=await client.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});if(result.error)throw result.error;
}
