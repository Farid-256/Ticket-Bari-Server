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

        // GET bookings by userId or vendorId
        app.get('/api/bookings', async (req, res) => {
            try {
                const { userId, vendorId } = req.query;
                const query = {};
                if (userId) query.userId = userId;
                if (vendorId) query.vendorId = vendorId;

                if (Object.keys(query).length === 0) {
                    return res.status(400).json({ error: 'userId or vendorId is required' });
                }

                const bookings = await bookingCollection.find(query).toArray();
                res.send(bookings);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // ---------------------------

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

        // ---------------------------

        // TICKET STATUS UPDATE (Admin Approve/Reject)
        app.put('/api/tickets/:id/status', async (req, res) => {
            try {
                const { id } = req.params;
                const { status } = req.body;
                if (!status) {
                    return res.status(400).json({ error: 'Status is required' });
                }
                const result = await ticketCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status } }
                );
                if (result.matchedCount === 0) {
                    return res.status(404).json({ error: 'Ticket not found' });
                }
                res.json({ success: true, message: `Ticket ${status} successfully` });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        })

        // PUT - Update booking status (Vendor Accept/Reject)
        app.put('/api/bookings/:id/status', async (req, res) => {
            try {
                const { id } = req.params;
                const { status } = req.body;
                if (!status) {
                    return res.status(400).json({ error: 'Status is required' });
                }
                const result = await bookingCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status } }
                );
                if (result.matchedCount === 0) {
                    return res.status(404).json({ error: 'Booking not found' });
                }
                res.json({ success: true, message: `Booking ${status} successfully` });
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
