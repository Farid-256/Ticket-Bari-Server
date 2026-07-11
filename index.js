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

//jwt4
const logger = (req, res, next) => {
    console.log('logger middleware logged', req.params);
    next();
}


async function run() {
    try {
        await client.connect();
        const database = client.db('ticketBari_db')
        const ticketCollection = database.collection('tickets')
        const bookingCollection = database.collection('bookings');
        const userCollection = database.collection('user');
        const sessonCollection = database.collection('sesson')

        //jwt5
        const verifyToken = async (req, res, next) => {

            //jwt7
            const authHeader = req.headers?.authorization
            if (!authHeader) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            const token = authHeader.split(' ')[1]
            if (!token) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            const query = { token: token }
            const session = await sessonCollection.findOne(query)

            const userId = session.userId
            const userQuery = {
                _id: userId
            }
            const user = await userCollection.findOne(userQuery)

            req.user = user
            next()
        }

        // must be used after verifyToken middleware
        const verifyUser = async (req, res, next) => {
            if (req.user?.role !== 'seeker') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        // must be used after verifyToken middleware
        const verifyVendor = async (req, res, next) => {
            if (req.user?.role !== 'recruiter') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }


        //ticket related api get
        app.get('/api/tickets', verifyToken, async (req, res) => {
            try {
                const query = {};

                // Vendor filter (if needed)
                if (req.query.vendorId) query.vendorId = req.query.vendorId;
                if (req.query.status) query.status = req.query.status;

                if (req.query.fromLocation) {
                    query.fromLocation = {
                        $regex: req.query.fromLocation,
                        $options: "i",
                    };
                }

                if (req.query.toLocation) {
                    query.toLocation = {
                        $regex: req.query.toLocation,
                        $options: "i",
                    };
                }

                if (req.query.transportType) {
                    query.transportType = req.query.transportType;
                }

                //  Pagination
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 6;
                const skip = (page - 1) * limit;

                //  Sort
                let sort = {};
                if (req.query.sort === 'price_asc') sort = { price: 1 };
                else if (req.query.sort === 'price_desc') sort = { price: -1 };
                else sort = { createdAt: -1 };

                const total = await ticketCollection.countDocuments(query);
                const tickets = await ticketCollection.find(query)
                    .sort(sort)
                    .skip(skip)
                    .limit(limit)
                    .toArray();

                res.send({
                    tickets,
                    total,
                    page,
                    totalPages: Math.ceil(total / limit),
                });
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

        // GET /api/transactions
        app.get('/api/transactions', async (req, res) => {
            try {
                const { userId } = req.query;
                if (!userId) {
                    return res.status(400).json({ error: 'userId is required' });
                }


                const bookings = await bookingCollection.find({
                    userId: userId,
                    status: 'paid'
                }).sort({ paidAt: -1 }).toArray();

                const transactions = bookings.map(booking => ({
                    transactionId: booking.paymentIntentId || booking._id,
                    amount: booking.totalPrice,
                    ticketTitle: booking.ticketTitle,
                    paymentDate: booking.paidAt || booking.createdAt,
                }));

                res.send(transactions);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });


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
        })

        // Latest Tickets (just approved, latest 6-8)
        app.get('/api/tickets/latest', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 8;
                const tickets = await ticketCollection
                    .find({ status: 'approved' })
                    .sort({ createdAt: -1 })
                    .limit(limit)
                    .toArray();
                res.send(tickets);
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
        })

        app.post('/api/confirm-payment', async (req, res) => {
            try {
                const { sessionId } = req.body;
                const session = await stripe.checkout.sessions.retrieve(sessionId);
                const bookingId = session.metadata.bookingId;
                const paymentIntentId = session.payment_intent; // Stripe payment intent ID


                await bookingCollection.updateOne(
                    { _id: new ObjectId(bookingId) },
                    {
                        $set: {
                            status: 'paid',
                            paymentIntentId: paymentIntentId,
                            paidAt: new Date()
                        }
                    }
                );


                const booking = await bookingCollection.findOne({ _id: new ObjectId(bookingId) });
                if (booking) {
                    await ticketCollection.updateOne(
                        { _id: new ObjectId(booking.ticketId) },
                        { $inc: { ticketQuantity: -booking.bookingQuantity } }
                    );
                }

                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // ---------------------------

        // TICKET STATUS UPDATE (Admin Approve/Reject)
        app.put('/api/tickets/:id/status', logger, verifyToken, async (req, res) => {
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
        })


        // VENDOR: UPDATE TICKET DETAILS (CLEAN)
        app.put('/api/tickets/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const updates = req.body;
                const { vendorId, status, ...updateFields } = updates; // status বাদ


                const existing = await ticketCollection.findOne({ _id: new ObjectId(id) });
                if (!existing) {
                    return res.status(404).json({ error: 'Ticket not found' });
                }


                if (existing.status === 'rejected') {
                    return res.status(403).json({ error: 'Rejected tickets cannot be updated' });
                }


                if (existing.vendorId !== vendorId) {
                    return res.status(403).json({ error: 'You can only update your own tickets' });
                }


                const result = await ticketCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updateFields }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ error: 'Ticket not found' });
                }

                const updatedTicket = await ticketCollection.findOne({ _id: new ObjectId(id) });
                res.json({ success: true, message: 'Ticket updated successfully', ticket: updatedTicket });
            } catch (error) {
                console.error('Update error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // ----------------------------------------------------------------------

        // VENDOR: DELETE TICKET
        app.delete('/api/tickets/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const { vendorId } = req.query;


                const existing = await ticketCollection.findOne({ _id: new ObjectId(id) });
                if (!existing) {
                    return res.status(404).json({ error: 'Ticket not found' });
                }


                if (existing.status === 'rejected') {
                    return res.status(403).json({ error: 'Rejected tickets cannot be deleted' });
                }


                if (existing.vendorId !== vendorId) {
                    return res.status(403).json({ error: 'You can only delete your own tickets' });
                }


                const result = await ticketCollection.deleteOne({ _id: new ObjectId(id) });

                if (result.deletedCount === 0) {
                    return res.status(404).json({ error: 'Ticket not found' });
                }

                res.json({ success: true, message: 'Ticket deleted successfully' });
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
