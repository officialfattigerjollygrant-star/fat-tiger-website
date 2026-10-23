const {json,validateUser,rest,updateOrder}=require('../lib/commerce');
module.exports=async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
 try{
  const {user}=await validateUser(req);const b=req.body||{};const code=String(b.tracking_code||'').trim();
  if(!/^FT[0-9A-F]{8,20}$/i.test(code))return json(res,400,{error:'Tracking code invalid hai.'});
  const rows=await rest('orders?select=id,status,payment_status,customer_user_id,razorpay_order_id&tracking_code=eq.'+encodeURIComponent(code)+'&customer_user_id=eq.'+encodeURIComponent(user.id)+'&limit=1');
  const order=rows?.[0];if(!order)return json(res,404,{error:'Is account ka pending order nahi mila.'});
  if(order.payment_status==='Paid')return json(res,409,{error:'Payment already verified hai; order ko Failed mark nahi kar sakte.'});
  if(order.status!=='Payment Pending')return json(res,200,{ok:true,status:order.status});
  await updateOrder(order.id,{status:'Payment Failed',payment_status:'Failed',updated_at:new Date().toISOString()});
  return json(res,200,{ok:true,status:'Payment Failed'});
 }catch(e){console.error('payment-failed',e.detail||e);return json(res,e.status||500,{error:e.message||'Payment failure status update nahi hua.'});}
};
