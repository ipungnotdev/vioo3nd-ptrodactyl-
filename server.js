import express from 'express';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';
import cron from 'node-cron';
import basicAuth from 'basic-auth';

const app = express();
const PORT = process.env.PORT || 3000;

// ======= SIMULASI DB & SETTINGS =======
let orders = [];
let panelPrices = {
    '2GB':1000,'4GB':4000,'5GB':6000,'6GB':8000,'7GB':10000,
    '9GB':12000,'10GB':15000,'Unlimited':17000
};

// Settings PLTA + Pakasir
let settings = {
    pakasir_merchant_id: "MERCHANT_ID_KAMU",
    pakasir_api_key: "API_KEY_KAMU",
    domain_panel_user: "https://panel.vioo3nd.com",
    domain_plta_admin: "https://admin.vioo3nd.com"
};

app.use(bodyParser.json());
app.use(express.static('public'));

// ======= USER QRIS =======
app.post('/api/create-order', async (req,res)=>{
    const { username, paket, harga } = req.body;
    if(!username || !paket || !harga) return res.status(400).json({success:false,message:"Data tidak lengkap"});

    const order_id = Date.now();
    orders.push({id:order_id, paket, username, harga, createdAt:Date.now(), server_id:`srv${order_id}`, suspended:false});

    const payload = {
        merchant_id: settings.pakasir_merchant_id,
        amount: harga,
        order_id: order_id.toString(),
        description: `Order Panel ${paket} - ${username}`,
        callback_url: settings.domain_panel_user + "/callback"
    };

    try{
        const response = await fetch("https://api.pakasir.id/v1/payment/create",{
            method:"POST",
            headers:{
                "Content-Type":"application/json",
                "Authorization":"Bearer " + settings.pakasir_api_key
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        res.json({success:true, qris_url:data.qris_url});
    }catch(err){
        console.error(err);
        res.status(500).json({success:false,message:"Gagal generate QRIS"});
    }
});

// ======= ADMIN =======
function authAdmin(req,res,next){
    const user = basicAuth(req);
    if(!user || user.name!=='admin' || user.pass!=='username123'){
        res.set('WWW-Authenticate','Basic realm="Admin Area"');
        return res.status(401).send('Unauthorized');
    }
    next();
}

app.get('/admin', authAdmin, (req,res)=>{
    res.sendFile('admin.html',{root:'public'});
});

app.get('/api/admin/orders', authAdmin, (req,res)=>res.json({orders}));
app.get('/api/admin/panel-prices', authAdmin, (req,res)=>res.json({panelPrices}));

app.post('/api/admin/update-price', authAdmin, (req,res)=>{
    const { paket, newPrice } = req.body;
    if(paket && newPrice) panelPrices[paket] = Number(newPrice);
    res.json({success:true, panelPrices});
});

// ======= SETTINGS ADMIN =======
app.get('/api/admin/settings', authAdmin, (req,res)=>res.json(settings));

app.post('/api/admin/settings', authAdmin, (req,res)=>{
    const { pakasir_merchant_id, pakasir_api_key, domain_panel_user, domain_plta_admin } = req.body;
    if(pakasir_merchant_id) settings.pakasir_merchant_id = pakasir_merchant_id;
    if(pakasir_api_key) settings.pakasir_api_key = pakasir_api_key;
    if(domain_panel_user) settings.domain_panel_user = domain_panel_user;
    if(domain_plta_admin) settings.domain_plta_admin = domain_plta_admin;
    res.json({success:true, settings});
});

// ======= AUTO SUSPEND VPS 30 HARI =======
cron.schedule('0 0 * * *', async ()=>{
    const now = Date.now();
    for(let order of orders){
        if(!order.suspended && now - order.createdAt >= 30*24*60*60*1000){
            console.log(`Suspend VPS ${order.server_id}`);
            order.suspended = true;
        }
    }
});

app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
