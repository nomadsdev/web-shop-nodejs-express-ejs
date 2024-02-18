const express = require('express');
const mysql = require('mysql');
const bodyParser = require('express');
const session = require('express-session');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const serverrun = `Server is running ${PORT}`;

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true
}));

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_DATABASE
});

db.connect((err) => {
    if (err) {
        console.error('Error connection to database');
    } else {
        console.log('Connected to database');
    }
});

app.get('/', (req, res) => {
    res.render('login');
});

app.post('/', function(req, res) {
    const username = req.body.username;
    const password = req.body.password;
    const sqlLogin = `SELECT * FROM users WHERE username = ? AND password = ?`;

    if (username && password) {
        db.query(sqlLogin, [username, password], function(err, LoginResults, fields) {
            if (LoginResults.length > 0) {
                req.session.loggedin = true;
                req.session.username = username;
                req.session.role = LoginResults[0].role;
                res.redirect('/home');
            } else {
                res.send('Invalid username or password');
            }
            res.end();
        });
    } else {
        res.send('Please enter username and password');
        res.end();
    }
});

app.get('/home', (req, res) => {
    if (req.session.loggedin) {
        const sqlUser = `SELECT * FROM users WHERE username = ?`;
        const sqlProducts = `SELECT * FROM products`;
        const sqlGetWebsite = `SELECT * FROM websites`;
        db.query(sqlUser, [req.session.username], (err, userResults) => {
            if (err) throw err;
            db.query(sqlProducts, (err, products) => {
                if (err) throw err;
                db.query(sqlGetWebsite, (err, WebsiteResults) => {
                    if (err) throw err;
                    res.render('home', { user: userResults[0], products, websites: WebsiteResults });
                })
            })
        });
    } else {
        res.redirect('/');
    }
});

app.get('/contact-admin', (req, res) => {
    res.render('contactAdmin');
});

app.get('/order-history', (req, res) => {
    if (!req.session.loggedin) {
        res.redirect('/');
        return;
    }

    const userId = req.session.userId;
    const sqlGetOrders = `SELECT * FROM orders WHERE user_id = ?`;
    db.query(sqlGetOrders, [userId], (err, orders) => {
        if (err) {
            console.error('Error retrieving orders:', err);
            res.send('Error retrieving orders');
            return;
        }
        res.render('orderHistory', { orders });
    });
});
app.post('/buy-product', (req, res) => {
    if (!req.session.loggedin) {
        res.redirect('/');
        return;
    }
    
    const productId = req.body.productId;
    const quantity = req.body.quantity;
    
    const sqlGetProduct = `SELECT * FROM products WHERE id = ?`;
    db.query(sqlGetProduct, [productId], (err, result) => {
        if (err) {
            console.error('Error retrieving product:', err);
            res.send('Error retrieving product');
            return;
        }
        
        const product = result[0];
        const totalPrice = product.price * quantity;

        if (req.session.point < totalPrice) {
            res.send('Insufficient points');
            return;
        }

        const sqlBuyProduct = `INSERT INTO orders (user_id, product_id, quantity, total_price) VALUES (?, ?, ?, ?)`;
        db.query(sqlBuyProduct, [req.session.userId, productId, quantity, totalPrice], (err, result) => {
            if (err) {
                console.error('Error buying product:', err);
                res.send('Error buying product');
                return;
            }

            const remainingPoints = req.session.point - totalPrice;
            const sqlUpdatePoints = `UPDATE users SET point = ? WHERE id = ?`;
            db.query(sqlUpdatePoints, [remainingPoints, req.session.userId], (err, result) => {
                if (err) {
                    console.error('Error updating points:', err);
                    res.send('Error updating points');
                    return;
                }
                
                res.redirect('/home');
            });
        });
    });
});

app.post('/update-website', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin') {
        res.redirect('/');
        return;
    }
    const { website_id, new_name } = req.body;
    const sqlUpdateWebsite = `UPDATE websites SET name = ? WHERE id = ?`;

    db.query(sqlUpdateWebsite, [new_name, website_id], (err, result) => {
        if (err) {
            console.error('Error updating website:', err);
            res.send('Error updating website');
            return;
        }
        res.redirect('/admin');
    });
});

app.get('/product/:id', (req, res) => {
    const productId = req.params.id;
    const sqlProduct = `SELECT * FROM products WHERE id = ?`;
    db.query(sqlProduct, [productId], (err, product) => {
        if (err) {
            console.error('Error retrieving product:', err);
            res.send('Error retrieving product');
            return;
        }
        res.render('productdis', { product });
    });
});

app.get('/logout', function(req, res) {
    req.session.destroy(function(err) {
        res.redirect('/');
    });
});

app.get('/admin', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin') {
        res.redirect('/');
        return;
    }
    const sqlAllUsers = `SELECT * FROM users`;
    const sqlProducts = `SELECT * FROM products`;
    const sqlDisProduct = `SELECT * FROM products`;
    const sqlGetWebsite = `SELECT * FROM websites`;
    db.query(sqlAllUsers, (err, allUsers) => {
        if (err) {
            console.error('Error retrieving users:', err);
            res.send('Error retrieving users');
            return;
        }
        db.query(sqlProducts, (err, products) => {
            if (err) throw err;
            db.query(sqlDisProduct, (err, totalProducts) => {
                if (err) throw err;
                db.query(sqlGetWebsite, (err, WebsiteResults) => {
                    if (err) throw err;
                    res.render('admin_home', { 
                        users: allUsers,
                        user: req.session.username,
                        products,
                        totalProducts: totalProducts,
                        websites: WebsiteResults
                    });
                })
            })
        })
    });
});

app.post('/edit-role', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin') {
        res.redirect('/');
        return;
    }
    const username = req.body.username;
    const newRole = req.body.role;
    const sqlUpdateRole = `UPDATE users SET role = ? WHERE username = ?`;

    db.query(sqlUpdateRole, [newRole, username], (err, result) => {
        if (err) {
            console.error('Error updating user role:', err);
            res.send('Error updating user role');
            return;
        }
        res.redirect('/admin');
    });
});

app.post('/delete-user', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin') {
        res.redirect('/');
        return;
    }
    const username = req.body.username;
    const sqlDeleteUser = `DELETE FROM users WHERE username = ?`;

    db.query(sqlDeleteUser, [username], (err, result) => {
        if (err) {
            console.error('Error deleting user:', err);
            res.send('Error deleting user');
            return;
        }
        res.redirect('/admin');
    });
});

app.post('/add-user', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin') {
        res.redirect('/');
        return;
    }
    const { username, password, role } = req.body;
    const sqlAddUser = `INSERT INTO users (username, password, role) VALUES (?, ?, ?)`;

    db.query(sqlAddUser, [username, password, role], (err, result) => {
        if (err) {
            console.error('Error adding user:', err);
            res.send('Error adding user');
            return;
        }
        res.redirect('/admin');
    });
});

app.post('/add-point', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin') {
        res.redirect('/');
        return;
    }
    const { username, point } = req.body;
    const sqlAddPoint = `UPDATE users SET point = point + ? WHERE username = ?`;

    db.query(sqlAddPoint, [point, username], (err, result) => {
        if (err) {
            console.error('Error adding point:', err);
            res.send('Error adding point');
            return;
        }
        res.redirect('/admin');
    });
});

app.post('/delete-point', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin') {
        res.redirect('/');
        return;
    }
    const { username } = req.body;
    const sqlDeletePoint = `UPDATE users SET point = 0 WHERE username = ?`;

    db.query(sqlDeletePoint, [username], (err, result) => {
        if (err) {
            console.error('Error deleting user point:', err);
            res.send('Error deleting user point');
            return;
        }
        res.redirect('/admin');
    });
});

app.post('/add-product', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin') {
        res.redirect('/');
        return;
    }
    const { name, price, description, image_url, quantity } = req.body;
    const sqlAddProduct = `INSERT INTO products (name, price, description, image_url, quantity) VALUES (?, ?, ?, ?, ?)`;

    db.query(sqlAddProduct, [name, price, description, image_url, quantity], (err, result) => {
        if (err) {
            console.error('Error adding product:', err);
            res.send('Error adding product');
            return;
        }
        const productId = result.insertId;
        const sqlUpdateQuantity = `UPDATE products SET quantity = ? WHERE id = ?`;
        db.query(sqlUpdateQuantity, [quantity, productId], (err, result) => {
            if (err) {
                console.error('Error updating product quantity:', err);
                res.send('Error updating product quantity');
                return;
            }
            res.redirect('/admin');
        });
    });
});

app.post('/delete-product', (req, res) => {
    const productId = req.body.product_id;
    const sqlDeleteProduct = `DELETE FROM products WHERE id = ?`;
    db.query(sqlDeleteProduct, [productId], (err, result) => {
        if (err) {
            console.error('Error deleting product:', err);
            res.send('Error deleting product');
            return;
        }
        res.redirect('/admin');
    });
});

app.post('/update-product', (req, res) => {
    const productId = req.body.product_id;
    const productName = req.body.name;
    const productPrice = req.body.price;
    const productDescription = req.body.description;

    const sqlUpdateProduct = `UPDATE products SET name = ?, price = ?, description = ? WHERE id = ?`;

    db.query(sqlUpdateProduct, [productName, productPrice, productDescription, productId], (err, result) => {
        if (err) {
            console.error('Error updating product:', err);
            res.send('Error updating product');
            return;
        }
        res.redirect('/admin');
    });
});

app.post('/edit-product', (req, res) => {
    const productId = req.body.product_id;
    const sqlGetProduct = `SELECT * FROM products WHERE id = ?`;
    db.query(sqlGetProduct, [productId], (err, result) => {
        if (err) {
            console.error('Error retrieving product:', err);
            res.send('Error retrieving product');
            return;
        }
        const product = result[0];
        res.send(`
            <head>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href='https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css' rel='stylesheet'>
                <script type="module" src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js"></script>
                <script nomodule src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.js"></script>
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@500&display=swap" rel="stylesheet">
                <style>
                    *{
                        font-family: "Noto Sans Thai", sans-serif;
                    }
                </style>
            </head>
            <script>
                document.addEventListener('DOMContentLoaded', () => {
                    const editButton = document.getElementById('editButton');
                    const modal = document.getElementById('editProductModal');
                    const closeBtn = document.querySelector('.close');

                    editButton.addEventListener('click', () => {
                        modal.style.display = 'block';
                    });

                    closeBtn.addEventListener('click', () => {
                        modal.style.display = 'none';
                    });
                });
            </script>
            <div class="flex justify-center px-5 py-20">
                <div class="max-w-4xl w-full">
                    <div id="editProductModal" class="modal border rounded-md shadow p-10 pb-5">
                    <div class="modal-content">
                        <div class="flex justify-between pb-2">
                            <h2>แก้ไขข้อมูลสินค้า</h2>
                            <a href="/admin" class="close">&times;</a>
                        </div>
                        <form action="/update-product" method="POST">
                            <input type="hidden" name="product_id" value="${product.id}">
                            <div class="pb-2">
                                <label for="name">ชื่อสินค้า <span class="text-red-500">*</span></label><br>
                                <input type="text" id="name" name="name" value="${product.name}" class="border rounded-md px-2 py-1 text-sm"><br>
                            </div>
                            <br>
                            <div class="pb-2">
                                <label for="price">ราคา <span class="text-red-500">*</span></label><br>
                                <input type="number" id="price" name="price" value="${product.price}" class="border rounded-md px-2 py-1 text-sm"><br>
                            </div>
                            <br>
                            <div class="pb-2">
                                <label for="description">รายละเอียด <span class="text-red-500">*</span></label><br>
                                <textarea id="description" name="description" class="border rounded-md px-2 py-1 text-sm">${product.description}</textarea><br>
                            </div>
                            <br>
                            
                            <button type="submit" class='border rounded-md w-full py-1 text-blue-500 border-blue-500 hover:bg-blue-500 hover:text-white transition'>อัพเดทข้อมูล</button>
                        </form>
                    </div>
                    </div>
                </div>
            </div>
        `);
    });
});

app.listen(PORT, () => {
    console.log(serverrun);
});