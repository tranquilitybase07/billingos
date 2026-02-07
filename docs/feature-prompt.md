I am building billingOS and taking reference from the polar repo because our base going to be same for most of the functionality. i have attached the screenshot of the features that we are planing to build
and will be using same setup as polar.sh and we will be using the same UI as well, so we have already setup the ui components and libarires and copied them billingOS which is a mono repo of Nextjs and Nestjs(BE).

So far i have setup Supabase with Magic link auth and it is working absolutely fine, the next step is to:

Add onboarding flow for businesses where they register their business and we will create a business on stripe as well for them polar is using stripe connect for this, you can check if you have any doubt. So what you need to do is check the polar stucture first how their onboarding is setup what information they are collecting from user and what tables and data they are creating and storing. and we might need to use Role base access as well this is optional for now but if you find it easy then include it as well because this platform is for team where they can invite other devs, users to the platform so just use what they are using no need to modify unless we are going out of track or you can ask question when you have doubt.

Then check how you will implement in billingOS and here is the project path /Users/ankushkumar/Code/billingos/

And later we will add more features so but for now focus on this part first focus on BE side then we will come to frontend.


I have some doubts related to billing OS. My first doubt is related to the product update policy. I mean like once a merchant created a product and now they want to update the price so how this thing should
work and how other products are doing it products like flow lad, andautumn so if they update the product price, should it be applied to all the existing customers or only to the new customers and since our
product is tightly coupled with stripe, so what does stripe support and what's the recommended approach and what we should do and second question is related to the features billing OS supports linking features
to the product and for example, a merchant creates a plan awith API calls 2000s and now they want to reduce the API calls to 1000 so should it be allowed or how other apps are handling it and what we should do
as well so take a look at the docs first how billing OS is implemented what are the APIS we have and how we have implemented the system overall and then look at the other products as well what they are doing
and what is the best recommended approach for us

/Users/ankushkumar/Code/flowglad
/Users/ankushkumar/Code/autumn

@docs/

Ask questions if you have any dobuts or questions, don't assume things, because these are critical decisions to make.