const {json,validateUser,rest,getSettings,haversineKm,notifyNewOrder}=require('../lib/commerce');
function trackCode(){return 'FT'+require('crypto').randomBytes(6).toString('hex').toUpperCase();}
async function priorOrders(uid, phone){
 const q1=await rest('orders?select=id,status,payment_status&customer_user_id=eq.'+encodeURIComponent(uid)+'&limit=300');
 const d=String(phone||'').replace(/\D/g,'');let q2=[];if(d.length>=10)q2=await rest('orders?select=id,status,payment_status,customer_phone&customer_phone=ilike.*'+encodeURIComponent(d.slice(-10))+'*&limit=300').catch(()=>[]);
 const map=new Map();for(const o of [...(q1||[]),...(q2||[])]){const status=String(o.status||'').toLowerCase(),payment=String(o.payment_status||'').toLowerCase();const failed=['cancelled','payment failed'].includes(status)||payment==='failed';const unpaidPending=status==='payment pending'||payment==='pending';if(!failed&&!unpaidPending)map.set(String(o.id),o);}return map.size>0;
}
module.exports=async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
 try{
  const {user}=await validateUser(req);const b=req.body||{};
  const name=String(b.name||'').trim().slice(0,120),phone=String(b.phone||'').trim(),email=String(b.email||user.email||'').trim().slice(0,240),address=String(b.address||'').trim().slice(0,500),deliveryType=b.delivery_type==='pickup'?'pickup':'delivery',payment=b.payment_method==='razorpay'?'razorpay':'cod';
  if(!name||phone.replace(/\D/g,'').length<10) return json(res,400,{error:'Name aur valid contact phone number required hai.'});
  if(deliveryType==='delivery'&&!address)return json(res,400,{error:'Delivery address required hai.'});
  const lines=Array.isArray(b.items)?b.items:[];if(!lines.length||lines.length>60)return json(res,400,{error:'Cart empty hai ya items limit se zyada hai.'});
  const ids=[...new Set(lines.map(x=>String(x.product_id||'')).filter(x=>/^[0-9a-fA-F-]{1,40}$/.test(x)))];if(ids.length===0||ids.length!==new Set(lines.map(x=>String(x.product_id||''))).size)return json(res,400,{error:'Menu item ID missing hai. Customer site refresh karke try karo.'});
  const settings=await getSettings();const store=await rest('store_settings?select=store_open&id=eq.1&limit=1');if(store[0]&&store[0].store_open===false)return json(res,409,{error:'FAT TIGER abhi closed hai.'});
  let distance=null;
  if(deliveryType==='delivery'){
   const lat=Number(b.latitude),lng=Number(b.longitude);
   if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat< -90||lat>90||lng< -180||lng>180)return json(res,400,{error:'Delivery ke liye location permission se current location verify karo.'});
   if(settings.outlet_lat==null||settings.outlet_lng==null)return json(res,503,{error:'Admin panel mein exact outlet latitude/longitude set nahi hai. Owner se Delivery / Offers settings configure karwao.'});
   distance=haversineKm(Number(settings.outlet_lat),Number(settings.outlet_lng),lat,lng);const maxKm=Number(settings.max_delivery_km||10);
   if(distance>maxKm){const far=distance>15?'Aapka address 15 km se bhi door hai. ':'Aapka address service area se bahar hai. ';return json(res,400,{code:'OUTSIDE_DELIVERY_AREA',error:far+'Home delivery maximum '+maxKm+' km ke andar hai; pickup choose kar sakte ho.'});}
  }
  const params=new URLSearchParams({select:'id,name,category,section,price,available',id:'in.('+ids.join(',')+')'});const menu=await rest('menu_items?'+params.toString());const map=new Map((menu||[]).map(x=>[String(x.id),x]));let subtotal=0;const orderLines=[];
  for(const line of lines){const id=String(line.product_id),item=map.get(id),qty=Number(line.quantity);if(!item||item.available!==true)return json(res,409,{error:'Ek item ab available nahi hai. Menu refresh karke try karo.'});if(!Number.isInteger(qty)||qty<1||qty>99)return json(res,400,{error:'Item quantity invalid hai.'});const price=Number(item.price),lt=price*qty;subtotal+=lt;orderLines.push({product_id:String(item.id),name:item.name,section:item.section||item.category,category:item.category,quantity:qty,unit_price:price,line_total:lt});}
  subtotal=Math.round(subtotal*100)/100;
  const isFirst=!(await priorOrders(user.id,phone));
  const discountPct=isFirst?Number(settings.first_order_discount_pct||10):(payment==='razorpay'?Number(settings.online_discount_pct||10):0);
  const discount=Math.round(subtotal*discountPct)/100;
  const freeDelivery=deliveryType==='pickup'||(isFirst&&settings.first_order_free_delivery)||subtotal>=Number(settings.free_delivery_threshold||399);
  const deliveryFee=deliveryType==='pickup'||freeDelivery?0:Number(settings.delivery_fee||0);
  const payable=Math.max(0,Math.round((subtotal-discount+deliveryFee)*100)/100);
  if(payment==='razorpay'&&(!settings.online_payment_enabled||!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET))return json(res,409,{error:'Online payment abhi owner ne enable nahi kiya hai ya Razorpay credentials missing hain. COD choose karo.'});
  const tracking=trackCode();let razorpay=null;
  if(payment==='razorpay'){
    const auth=Buffer.from(process.env.RAZORPAY_KEY_ID+':'+process.env.RAZORPAY_KEY_SECRET).toString('base64');
    const rr=await fetch('https://api.razorpay.com/v1/orders',{method:'POST',headers:{Authorization:'Basic '+auth,'Content-Type':'application/json'},body:JSON.stringify({amount:Math.round(payable*100),currency:'INR',receipt:tracking,notes:{tracking_code:tracking,customer_user_id:user.id}})});
    const rd=await rr.json().catch(()=>({}));if(!rr.ok||!rd.id)return json(res,502,{error:'Razorpay order create nahi hua. Merchant setup check karo.'});razorpay={order_id:rd.id,key_id:process.env.RAZORPAY_KEY_ID,amount:rd.amount,currency:rd.currency};
  }
  const order={tracking_code:tracking,tracking_session_id:b.tracking_session_id||null,customer_user_id:user.id,customer_name:name,customer_email:email||null,customer_phone:phone,customer_address:address||'Pickup at outlet',payment_method:payment==='razorpay'?'Razorpay Online':'Cash on delivery',items:orderLines,subtotal_amount:subtotal,discount_amount:discount,delivery_fee:deliveryFee,delivery_distance_km:distance,delivery_type:deliveryType,address_lat:deliveryType==='delivery'?Number(b.latitude):null,address_lng:deliveryType==='delivery'?Number(b.longitude):null,total_amount:payable,status:payment==='razorpay'?'Payment Pending':'New',payment_status:payment==='razorpay'?'Pending':'COD',razorpay_order_id:razorpay?.order_id||null,first_order_offer:isFirst,promo_description:discountPct?`${discountPct}% discount (${isFirst?'first order':'online payment'})`:null,updated_at:new Date().toISOString()};
  const saved=await rest('orders',{method:'POST',headers:{Prefer:'return=representation'},body:[order]});const savedOrder=saved?.[0];if(!savedOrder)return json(res,500,{error:'Order save nahi hua.'});
  const profileSync={user_id:user.id,full_name:name,email:email||user.email||null,phone,updated_at:new Date().toISOString()};if(deliveryType==='delivery')profileSync.default_address=address;await rest('ft_customer_profiles?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:[profileSync]}).catch(e=>console.warn('Profile order-sync skipped:',e.message));
  let notification='queued';if(payment==='cod'){const ns=await notifyNewOrder(savedOrder);notification=ns.some(x=>x?.sent)?'sent':'not-configured-or-failed';}
  return json(res,200,{ok:true,order_id:savedOrder.id,tracking_code:tracking,status:savedOrder.status,subtotal,discount,delivery_fee:deliveryFee,total_amount:payable,first_order_offer:isFirst,promo_description:order.promo_description,delivery_distance_km:distance,payment_method:order.payment_method,razorpay,notification});
 }catch(e){console.error('create-order error',e.detail||e);return json(res,e.status||500,{error:e.message||'Order create error'});}
};
