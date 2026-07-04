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
        const userCollection = database.collection('user');

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
        })

        app.get('/api/bookings/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const booking = await bookingCollection.findOne({ _id: new ObjectId(id) });
                if (!booking) return res.status(404).json({ error: 'Booking not found' });
                res.send(booking);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        })


        //get all user (just admin)
        app.get('/api/users', async (req, res) => {
            try {
                const users = await userCollection.find({}).toArray();
                const safeUsers = users.map(({ password, ...rest }) => rest);
                res.send(safeUsers);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        })

        // 1.all approuved ticket
        app.get('/api/tickets/approved', async (req, res) => {
            try {
                const tickets = await ticketCollection.find({ status: 'approved' }).toArray();
                res.send(tickets);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // 2.advice ticket home page
        app.get('/api/tickets/advertised', async (req, res) => {
            try {
                const tickets = await ticketCollection.find({ isAdvertised: true }).toArray();
                res.send(tickets);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        })


        // Vendor Stats API
        app.get('/api/vendor/stats', async (req, res) => {
            try {
                const { vendorId } = req.query;
                if (!vendorId) {
                    return res.status(400).json({ error: 'vendorId is required' });
                }

                // 1. Total Revenue (from paid bookings)
                const revenueAgg = await bookingCollection.aggregate([
                    { $match: { vendorId, status: 'paid' } },
                    { $group: { _id: null, total: { $sum: '$totalPrice' } } }
                ]).toArray();
                const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;

                // 2. Total Tickets Sold (sum of bookingQuantity from paid bookings)
                const soldAgg = await bookingCollection.aggregate([
                    { $match: { vendorId, status: 'paid' } },
                    { $group: { _id: null, totalQty: { $sum: '$bookingQuantity' } } }
                ]).toArray();
                const totalSold = soldAgg.length > 0 ? soldAgg[0].totalQty : 0;

                // 3. Total Tickets Added (all tickets by this vendor)
                const totalAdded = await ticketCollection.countDocuments({ vendorId });

                // 4. Monthly Revenue for Chart (last 6 months)
                const sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

                const monthlyAgg = await bookingCollection.aggregate([
                    {
                        $match: {
                            vendorId,
                            status: 'paid',
                            createdAt: { $gte: sixMonthsAgo }
                        }
                    },
                    {
                        $group: {
                            _id: {
                                year: { $year: '$createdAt' },
                                month: { $month: '$createdAt' }
                            },
                            revenue: { $sum: '$totalPrice' }
                        }
                    },
                    { $sort: { '_id.year': 1, '_id.month': 1 } }
                ]).toArray();

                // Format month labels (e.g., "Jan 2025")
                const monthlyData = monthlyAgg.map(item => ({
                    month: `${new Date(item._id.year, item._id.month - 1).toLocaleString('default', { month: 'short' })} ${item._id.year}`,
                    revenue: item.revenue
                }));

                res.json({
                    totalRevenue,
                    totalSold,
                    totalAdded,
                    monthlyData
                });
            } catch (error) {
                console.error('Vendor stats error:', error);
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
        })

        // 2.user role update
        app.put('/api/users/:id/role', async (req, res) => {
            try {
                const { id } = req.params;
                const { role } = req.body;
                if (!role) return res.status(400).json({ error: 'Role is required' });

                const result = await userCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { role } }
                );
                if (result.matchedCount === 0) {
                    return res.status(404).json({ error: 'User not found' });
                }
                res.json({ success: true, message: `User role updated to ${role}` });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // 3.fraud Vendor marking
        app.put('/api/users/:id/fraud', async (req, res) => {
            try {
                const { id } = req.params;
                const result = await userCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { isFraud: true, role: 'fraud' } } // রোল fraud সেট করো
                );
                if (result.matchedCount === 0) {
                    return res.status(404).json({ error: 'User not found' });
                }
                await ticketCollection.updateMany(
                    { vendorId: id },
                    { $set: { isVisible: false, status: 'hidden' } }
                );
                res.json({ success: true, message: 'Vendor marked as fraud' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        })

        //advice status toggle
        app.put('/api/tickets/:id/advertise', async (req, res) => {
            try {
                const { id } = req.params;
                const { isAdvertised } = req.body; // true বা false

                // আগে অ্যাডভার্টাইজড টিকেট কাউন্ট চেক করো (যদি true করতে চায়)
                if (isAdvertised === true) {
                    const advertisedCount = await ticketCollection.countDocuments({ isAdvertised: true });
                    if (advertisedCount >= 6) {
                        return res.status(400).json({
                            error: 'You can advertise maximum 6 tickets at a time'
                        });
                    }
                }

                const result = await ticketCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { isAdvertised } }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ error: 'Ticket not found' });
                }

                res.json({ success: true, message: `Ticket ${isAdvertised ? 'advertised' : 'unadvertised'} successfully` });
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
