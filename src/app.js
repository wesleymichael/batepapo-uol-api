import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv"

//Cria o servidor
const app = express();

//Config.
app.use(express.json());
app.use(cors());
dotenv.config();


//Conexão com o db
const mongoClient = new MongoClient(process.env.DATABASE_URL);
try{
    await mongoClient.connect();
    console.log("MongoDB is connected");
} catch (err){
    console.log(err.message);
}
const db = mongoClient.db();


const PORT = 5000;
app.listen(PORT, () => console.log(`server running on port ${PORT}`));