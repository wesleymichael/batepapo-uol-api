import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import Joi from "joi";
import dayjs from "dayjs";

const app = express();

//Config.
app.use(express.json());
app.use(cors());
dotenv.config();

//Connection to mongodb
const mongoClient = new MongoClient(process.env.DATABASE_URL);
try{
    await mongoClient.connect();
    console.log("MongoDB is connected");
} catch (err){
    console.log(err.message);
}
const db = mongoClient.db();

//Validation
const schemaName = Joi.object({
    name:  Joi.string()
        .min(1)
        .required(),
});

//EndPoints
app.post("/participants", async (req, res) => {
    const {name} = req.body;

    const validation = schemaName.validate({name});
    if(validation.error){
        res.status(422).send(validation.error.details[0].message);
        return;
    }
    try{
        const nameUsed = await db.collection('participants').findOne({name: name});
        if( nameUsed ) return res.status(409).send('Nome de usuário já existe.');

        await db.collection('participants').insertOne( {name, lastStatus: Date.now()} );
        await db.collection('messages').insertOne({
            from: name,
            to: 'Todos',
            text: 'entra na sala...',
            type: 'status',
            time: dayjs().format('HH:mm:ss')
        });
        res.sendStatus(201);
    } catch (err){
        res.status(500).send(err.message);
    }
})

app.get("/participants", async (req, res) => {
    try{
        const participats = await db.collection('participants').find().toArray();
        res.send(participats);
    } catch (err){
        res.status(500).send(err.message);
    }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`server running on port ${PORT}`));