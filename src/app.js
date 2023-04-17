import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import Joi from "joi";
import dayjs from "dayjs";
import { stripHtml } from "string-strip-html";

const app = express();

//Config.
app.use(express.json());
app.use(cors());
dotenv.config();

//Connection to mongodb
const mongoClient = new MongoClient(process.env.DATABASE_URL);
try {
    await mongoClient.connect();
    console.log("MongoDB is connected");
} catch (err) {
    console.log(err.message);
}
const db = mongoClient.db();

//Validation
const schemaMessage = Joi.object({
    from: Joi.string().required(),
    to: Joi.string().min(1).required(),
    text: Joi.string().min(1).required(),
    type: Joi.any().valid('message', 'private_message').required(),
    time: Joi.required(),
});

function isString(to, text, type, from){
    if(typeof to === "string" && typeof text === "string" && typeof type === "string" && typeof from === "string"){
        return true;
    } else {
        return false;
    }
}

//EndPoints
app.post("/participants", async (req, res) => {
    let name = req.body.name;

    if(typeof name === "string"){
        try{
            name = stripHtml(name).result.trim();
        } catch (error) {
            return res.status(500).send("Erro ao sanitizar o nome do participante.");
        }
    }

    const schemaName = Joi.object({
        name: Joi.string()
            .min(1)
            .required(),
    });

    const { error } = schemaName.validate({ name }, {abortEarly: false});

    if(error){
        const errors = error.details.map( (detail) => detail.message);
        return res.status(422).send(errors);
    }

    try {
        const nameUsed = await db.collection('participants').findOne({ name: name });
        if (nameUsed) return res.status(409).send('Nome de usuário já existe.');

        await db.collection('participants').insertOne({ name, lastStatus: Date.now() });
        await db.collection('messages').insertOne({
            from: name,
            to: 'Todos',
            text: 'entra na sala...',
            type: 'status',
            time: dayjs().format('HH:mm:ss')
        });
        res.sendStatus(201);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.post("/messages", async (req, res) => {
    const { to, text, type } = req.body;
    const from = req.headers.user;
    
    let message = {from, to, text, type,  time: dayjs().format('HH:mm:ss')};

    if( isString(to, text, type, from) ){
        try{
            message = {
                from: stripHtml(from).result.trim(),
                to: stripHtml(to).result.trim(),
                text: stripHtml(text).result.trim(),
                type: stripHtml(type).result.trim(),
                time: dayjs().format('HH:mm:ss')
            };
        } catch (error) {
            return res.status(500).send("Erro ao sanitizar a mensagem.");
        }
    }

    const { error } = schemaMessage.validate(message, {abortEarly: false});

    if(error){
        const errors = error.details.map( (detail) => detail.message);
        return res.status(422).send(errors);
    }

    try {
        const sender = await db.collection('participants').findOne({ name: from });

        if (!sender){
            return res.status(422).send("Usuário não encontrado.");
        }

        await db.collection('messages').insertOne(message);
        res.sendStatus(201);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.get("/participants", async (req, res) => {
    try {
        const participats = await db.collection('participants').find().toArray();
        res.send(participats);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.get("/messages", async (req, res) => {
    const user = req.headers.user.trim();
    const { limit } = req.query;

    const schemaLimit = Joi.string().regex(/^[1-9][0-9]*$/);
    
    const { error } = schemaLimit.validate(limit, {abortEarly: false});
    if(error){
        const errors = error.details.map( (detail) => detail.message);
        return res.status(422).send(errors);
    }

    try {
        const conditions = {
            $or: [
                { type: "message" },
                { to: "Todos" },
                {
                    $and: [
                        { type: "private_message" }, { to: user }
                    ]
                },
                {
                    $and: [
                        { type: "private_message" }, { from: user }
                    ]
                },
            ]
        };
        const messages = await db.collection('messages').find(conditions).toArray();
        (limit) ? res.send(messages.slice(-limit)) : res.send(messages);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.post("/status", async (req, res) => {
    const user = req.headers.user.trim();
    if (!user) return res.sendStatus(404);

    try {
        const result = await db.collection('participants').updateOne({ name: user }, { $set: { from: user, lastStatus: Date.now() } });
        if (result.modifiedCount === 0) return res.sendStatus(404);
        res.sendStatus(200);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.delete("/messages/:id", async (req, res) => {
    const from = req.headers.user.trim();
    const id = req.params.id;
    try{
        const message = await db.collection('messages').findOne({ _id: new ObjectId(id)});

        if(!message) return res.status(404).send('Mensagem não encontrada');

        if(from !== message.from) return res.status(401).send('Usuário não autorizado a deletar mensagem');
        
        await db.collection('messages').deleteOne({ _id: new ObjectId(id)});
        res.sendStatus(200);
    } catch (error){
        res.status(500).send(error.message);
    }
});

app.put("/messages/:id", async (req, res) => {
    const { to, text, type } = req.body;
    const from = req.headers.user;
    const id = req.params.id;
    
    let messageUpdate = {from, to, text, type,  time: dayjs().format('HH:mm:ss')};
    if(to && text && type && from){
        try{
            messageUpdate = {
                from: stripHtml(from).result.trim(),
                to: stripHtml(to).result.trim(),
                text: stripHtml(text).result.trim(),
                type: stripHtml(type).result.trim(),
                time: dayjs().format('HH:mm:ss')
            };
        } catch (error) {
            return res.status(500).send("Erro ao sanitizar a mensagem");
        }
    }
    
    const { error } = schemaMessage.validate(messageUpdate, {abortEarly: false});

    if(error){
        const errors = error.details.map( (detail) => detail.message);
        return res.status(422).send(errors);
    }

    try{
        const sender = await db.collection('participants').findOne({ name: from });
        if (!sender) return res.status(422).send("Usuário não encontrado.");

        const message = await db.collection('messages').findOne({ _id: new ObjectId(id)});

        if(!message) return res.status(404).send('Mensagem não encontrada');

        if(from !== message.from) return res.status(401).send('Usuário não autorizado a deletar mensagem');

        await db.collection("messages").updateOne(
            { _id: new ObjectId(id) },
            { $set: messageUpdate }
        );
        res.send("Mensagem editada");
    } catch (error) {
        res.status(500).send(error.message);
    }
});

setInterval(async () => {
    const condition = {
        lastStatus: { $lt: Date.now() - 10000 }
    };
    try{
        const usersOff = await db.collection('participants').find(condition).toArray();

        usersOff.forEach(async (user) => {
            await db.collection('participants').deleteOne({ name: user.name });
            await db.collection('messages').insertOne({
                from: user.name,
                to: 'Todos',
                text: 'sai da sala...',
                type: 'status',
                time: dayjs().format('HH:mm:ss')
            });
        });
    } catch (error){
        console.log(error);
    }
}, 15000);

const PORT = 5000;
app.listen(PORT, () => console.log(`server running on port ${PORT}`));