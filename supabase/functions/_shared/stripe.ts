import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type StripeRequest=(path:string,method?:string,body?:Record<string,string>,idempotencyKey?:string)=>Promise<any>

export const stripeClient=(secretKey:string):StripeRequest=>async(path,method='GET',body,idempotencyKey)=>{
  const headers:Record<string,string>={authorization:`Bearer ${secretKey}`,'content-type':'application/x-www-form-urlencoded'}
  if(idempotencyKey)headers['idempotency-key']=idempotencyKey
  const response=await fetch(`https://api.stripe.com/v1/${path}`,{method,headers,body:body?new URLSearchParams(body).toString():undefined})
  const result=await response.json()
  if(!response.ok)throw new Error(`Stripe ${response.status} ${path}: ${result?.error?.message||''}`)
  return result
}

const notFoundAsNull=(error:Error)=>{if(error.message.startsWith('Stripe 404'))return null;throw error}

// Assinaturas que cobram ou ainda podem cobrar.
export const LIVE_STATUSES=['active','trialing','past_due','unpaid']

export interface PlanRow { name:string; monthly_price:number|string; max_songs:number|null; stripe_product_id:string|null; stripe_price_id:string|null }
export const PLAN_COLUMNS='name,monthly_price,max_songs,is_active,stripe_product_id,stripe_price_id'

/**
 * Devolve o Price mensal do plano, criando Product e Price no Stripe quando
 * faltam ou quando o valor do catálogo mudou. O Product é estável (renomear só
 * atualiza o nome) e o webhook identifica o plano por ele. Preços antigos não
 * são desativados: quem já assina continua no valor contratado.
 */
export async function ensurePlanPrice(admin:SupabaseClient,stripe:StripeRequest,plan:PlanRow):Promise<string>{
  const amount=Math.round(Number(plan.monthly_price)*100)
  let productId=plan.stripe_product_id
  if(productId){
    const product=await stripe(`products/${encodeURIComponent(productId)}`).catch(notFoundAsNull)
    if(!product)productId=null
    else if(product.name!==plan.name)await stripe(`products/${encodeURIComponent(productId)}`,'POST',{name:plan.name})
  }
  if(!productId){
    // A chave de idempotência evita dois Products para o mesmo plano em checkouts simultâneos.
    const product=await stripe('products','POST',{name:plan.name,'metadata[plan_name]':plan.name},`plan-product:${plan.name}`)
    productId=product.id as string
  }
  if(plan.stripe_price_id&&productId===plan.stripe_product_id){
    const price=await stripe(`prices/${encodeURIComponent(plan.stripe_price_id)}`).catch(notFoundAsNull)
    if(price?.active&&price.unit_amount===amount&&price.currency==='brl'&&price.recurring?.interval==='month'&&price.product===productId)return price.id
  }
  const price=await stripe('prices','POST',{product:productId,currency:'brl',unit_amount:String(amount),'recurring[interval]':'month','metadata[plan_name]':plan.name},`plan-price:${productId}:${amount}`)
  const {error}=await admin.from('subscription_plans').update({stripe_product_id:productId,stripe_price_id:price.id}).eq('name',plan.name)
  if(error)throw error
  return price.id
}
