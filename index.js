const express = require('express')
const dotenv = require('dotenv')
const cors = require('cors')
dotenv.config()
const app = express()
const port = process.env.PORT

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = process.env.MONGODB_URI

app.use(cors())
app.use(express.json())

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

app.get('/', (req, res) => {
    res.send('Hello form express')
})

async function run() {
    try {
        await client.connect();
        const database = client.db('ticketBari_db')
        const ticketCollection = database.collection('tickets')
        const bookingCollection = database.collection('bookings');

        //add ticket api get
        app.get('/api/tickets', async (req, res) => {
            try {
                const query = {};
                if (req.query.vendorId) {
                    query.vendorId = req.query.vendorId;
                }
                if (req.query.status) {
                    query.status = req.query.status;
                }

                const result = await ticketCollection.find(query).toArray();
                res.send(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        //details page
        app.get('/api/allTickets/:id', async (req, res) => {
            const id = req.params.id
            const query = {
                _id: new ObjectId(id)
            }
            const result = await ticketCollection.findOne(query)
            res.send(result)
        });

        //add ticket api
        app.post('/api/tickets', async (req, res) => {
            const ticket = req.body
            const result = await ticketCollection.insertOne(ticket)
            res.send(result)
        })

        // POST - create booking
        app.post('/api/bookings', async (req, res) => {
            try {
                const booking = req.body;
                const result = await bookingCollection.insertOne(booking);
                res.status(201).json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });









        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log(`App listening on port: ${port}`)
})
