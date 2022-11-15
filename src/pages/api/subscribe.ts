import { NextApiRequest, NextApiResponse } from "next";
import { getSession } from 'next-auth/react';
import { stripe } from "../../services/stripe";
import { query as q } from "faunadb";
import { fauna } from "../../services/fauna";

interface tempUser {
    ref:{
        id: string
    }
    data: {
        stripe_customer_id: string
    }
}

export default async (req: NextApiRequest, res: NextApiResponse) => {
    if(req.method === 'POST'){
        const user = await req.body.user;

        const tempUser = await fauna.query<tempUser>(
            q.Get(
                q.Match(
                    q.Index('user_by_email'),
                    q.Casefold(user.email)
                )
            )
        )

        let customerId = tempUser.data.stripe_customer_id

        if(!customerId){
            const stripeCustomer = await stripe.customers.create({
                email: user.email,
            });

            await fauna.query(
                q.Update(
                    q.Ref(q.Collection('users'), tempUser.ref.id),
                    {
                        data: {
                            stripe_customer_id: stripeCustomer.id,
                        }
                    }
                )
            )

            customerId = stripeCustomer.id
        }

        

        

        const stripeCheckoutSession = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            billing_address_collection: 'required',
            line_items: [
                { price: 'price_1LZlQQKlCdi5ewN0uV3pND4H', quantity: 1}
            ],
            mode: 'subscription',
            allow_promotion_codes: true,
            success_url: process.env.STRIPE_SUCCESS_URL,
            cancel_url: process.env.STRIPE_CANCEL_URL
        })

        return res.status(200).json({ sessionId: stripeCheckoutSession.id })
    } else {
        res.setHeader('Allow', 'POST')
        res.status(405).end('Method not allowed')
    }
}