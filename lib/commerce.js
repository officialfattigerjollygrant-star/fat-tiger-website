const crypto = require('crypto');

function env(name, required=true) {
  const v = String(process.env[name] || '').trim();
  if (required && !v) throw new Error('Missing Vercel environment variable: ' + name);
  return v;
}
function json(res, status, payload) { res.setHeader('Cache-Control','no-store'); return res.status(status).json(payload); }
function bearer(req) { const h=String(req.headers.authorization||''); return h.startsWith('Bearer ')?h.slice(7):''; }
function baseUrl(){ return env('SUPABASE_URL').replace(/\/$/,''); }
function anonKey(){ return env('SUPABASE_ANON_KEY'); }
function serviceKey(){ return env('SUPABASE_SERVICE_ROLE_KEY'); }
async function validateUser(req){
  const token=bearer(req); if(!token) throw Object.assign(new Error('OTP login required hai.'),{status:401});
  const r=await fetch(baseUrl()+'/auth/v1/user',{headers:{apikey:anonKey(),Authorization:'Bearer '+token}});
  const u=await r.json().catch(()=>null); if(!r.ok||!u?.id)throw Object.assign(new Error('Login session invalid/expired hai. Dobara OTP login karo.'),{status:401});
  return {user:u,token};
}
async function rest(path, options={}){
  const headers={apikey:serviceKey(),Authorization:'Bearer '+serviceKey(),...(options.headers||{})};
  if(options.body && !headers['Content-Type'])headers['Content-Type']='application/json';
  const r=await fetch(baseUrl()+'/rest/v1/'+path,{method:options.method||'GET',headers,body:options.body?JSON.stringify(options.body):undefined});
  const txt=await r.text();let data;try{data=txt?JSON.parse(txt):null;}catch{data=txt;}
  if(!r.ok)throw Object.assign(new Error(data?.message||data?.hint||data?.error||('Supabase database error (HTTP '+r.status+')')),{status:500,detail:data});
  return data;
}
async function getSettings(){ const rows=await rest('ft_checkout_settings?select=*&id=eq.1&limit=1');if(!rows?.length)throw Object.assign(new Error('Admin mein Delivery / Offers / Payments settings row missing hai.'),{status:503});return rows[0]; }
async function requireAdmin(req){const {user,token}=await validateUser(req);const rows=await rest('ft_admin_users?select=user_id&user_id=eq.'+encodeURIComponent(user.id)+'&limit=1');if(!rows?.length)throw Object.assign(new Error('Yeh action sirf authorised FAT TIGER owner kar sakta hai.'),{status:403});return {user,token};}
function digitsPhone(phone){let d=String(phone||'').replace(/\D/g,'');if(d.length===10)d='91'+d;return d;}
function haversineKm(a,b,c,d){const rad=x=>x*Math.PI/180;const x=rad(c-a),y=rad(d-b);const v=Math.sin(x/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(y/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.min(1,v)));}
async function updateOrder(id,fields){const rows=await rest('orders?id=eq.'+encodeURIComponent(String(id)),{method:'PATCH',headers:{Prefer:'return=representation'},body:fields});return rows?.[0]||null;}
async function sendFlow(templateId, recipients){
  if(!templateId||!process.env.MSG91_AUTH_KEY)return {sent:false,skipped:true,reason:'MSG91 not configured'};
  const r=await fetch('https://control.msg91.com/api/v5/flow',{method:'POST',headers:{authkey:process.env.MSG91_AUTH_KEY,'content-type':'application/json',accept:'application/json'},body:JSON.stringify({template_id:templateId,short_url:'0',recipients})});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error('MSG91 send failed (HTTP '+r.status+'): '+JSON.stringify(data).slice(0,250));return {sent:true,data};
}
async function notifyNewOrder(order){
  const outlet=digitsPhone(process.env.OUTLET_PHONE||'919368123145');
  const rows=[];
  try{rows.push(await sendFlow(process.env.MSG91_ORDER_TEMPLATE_ID,[{mobiles:outlet,VAR1:String(order.customer_name||'Customer').slice(0,80),VAR2:String(order.tracking_code||''),VAR3:String(order.customer_phone||''),VAR4:String(order.total_amount||0),VAR5:String(order.payment_method||''),VAR6:String(order.delivery_type||'delivery')} ]));}catch(e){console.error('Outlet SMS failed',e.message);}
  try{if(order.customer_phone)rows.push(await sendFlow(process.env.MSG91_CUSTOMER_TEMPLATE_ID,[{mobiles:digitsPhone(order.customer_phone),VAR1:String(order.tracking_code||''),VAR2:'received',VAR3:outlet,VAR4:String(order.total_amount||0)}]));}catch(e){console.error('Customer SMS failed',e.message);}
  return rows;
}
async function notifyOrderStatus(order,status){
  if(status!=='On the Way')return {sent:false,skipped:true};
  const outlet=digitsPhone(process.env.OUTLET_PHONE||'919368123145');
  return sendFlow(process.env.MSG91_ON_WAY_TEMPLATE_ID,[{mobiles:digitsPhone(order.customer_phone),VAR1:String(order.tracking_code||''),VAR2:'On the Way',VAR3:outlet}]);
}
module.exports={env,json,bearer,baseUrl,anonKey,serviceKey,validateUser,rest,getSettings,requireAdmin,digitsPhone,haversineKm,updateOrder,notifyNewOrder,notifyOrderStatus};
