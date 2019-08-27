// load .env data into process.env
require('dotenv').config();

// Web server config
const PORT       = process.env.PORT || 8080;
const ENV        = process.env.ENV || "development";
const express    = require("express");
const bodyParser = require("body-parser");
const sass       = require("node-sass-middleware");
const app        = express();
const morgan     = require('morgan');
const methodOverride = require('method-override');
const cookieSession = require('cookie-session');
// const cookieParser = require('cookie-parser');
// const bcrypt     = require('bcrypt');

// PG database client/connection setup
const { Pool } = require('pg');
const dbParams = require('./lib/db.js');
const db = new Pool(dbParams);
db.connect();

// Postgres SQL files
// const { addTask } = require('./db/db_queries');

// Load the logger first so all (static) HTTP requests are logged to STDOUT
// 'dev' = Concise output colored by response status for development use.
//         The :status token will be colored red for server error codes, yellow for client error codes, cyan for redirection codes, and uncolored for all other codes.
app.use(morgan('dev'));

//setup method override for RESTful
app.use(methodOverride('_method'));

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use("/styles", sass({
  src: __dirname + "/styles",
  dest: __dirname + "/public/styles",
  debug: true,
  outputStyle: 'expanded'
}));
app.use(express.static("public"));
const expiryDate = new Date(Date.now() + (7 * 24 * 60 * 60 * 100));
app.use(cookieSession({
  name: 'listify',
  keys: ['12345'],
  // maxAge: 24 * 60 * 60 * 1000
  expires: expiryDate
}));
//setup the cookie for name, key and 24 hours maximum session stay if session is still open

// app.use(cookieParser());

// Separated Routes for each Resource
// Note: Feel free to replace the example routes below with your own
const usersRoutes = require("./routes/users");
// const widgetsRoutes = require("./routes/widgets");

// Mount all resource routes
// Note: Feel free to replace the example routes below with your own
app.use("/api/users", usersRoutes(db));
// app.use("/api/widgets", widgetsRoutes(db));
// Note: mount other resources here, using the same pattern above

/* Start of DELETE queries */
app.delete(":user_id/:task/:category", (req, res) => {
  if (!req.session.userID) {
    res.redirect('/');
  }
  console.log("Delete all tasks in category");
  let queryStr = `DELETE FROM tasks WHERE user_id=$1 AND category=$2 RETURNING *;
  `;
  db.query(queryStr, [req.session.userID, req.params.category])
    .then(result => {
      if (result.rows[0] === undefined) {
        // delete not successful
      }
    })
    .catch(e => res.send(e));
});

app.delete(":user_id/:task/", (req, res) => {
  if (!req.session.userID) {
    res.redirect('/');
  }
  console.log("Delete task");
  let queryStr = `DELETE FROM tasks WHERE user_id=$1 AND id=$2 RETURNING *;
  `;
  db.query(queryStr, [req.session.userID, req.params.task])
    .then(result => {
      if (result.rows[0] === undefined) {
        // delete not successful
      }
    })
    .catch(e => res.send(e));
});

app.delete(":user_id/", (req, res) => {
  if (!req.session.userID) {
    res.redirect('/');
  }

  console.log("Delete user");

  let queryStr = `DELETE FROM users WHERE user=$1 RETURNING *;
  `;
  db.query(queryStr, [req.session.userID])
    .then(result => {
      if (result.rows[0] === undefined) {
        // delete not successful
      }
    })
    .catch(e => res.send(e));
});

/* Start of GET queries */
// Home page
// Warning: avoid creating more routes in this file!
// Separate them into separate routes files (see above).
app.get("/", (req, res) => {
  const userID = req.session.userID;
  console.log(userID);

  if (userID) {
    const userQueryString = `SELECT id, full_name FROM users WHERE id=$1;
    `;
    console.log("Route for GET/ w user=", req.session.userID);
    db.query(userQueryString, [req.session.userID])
      .then(user => {
        console.log("Index 1st .then", user.rows[0]);

        const categories = ['eat', 'buy', 'read', 'watch'];
        const categoryQueryString = 'SELECT tasks.description, tasks.category, to_char(tasks.last_modified, \'Mon DD, YYYY\') AS last_modified FROM tasks JOIN users on user_id = users.id WHERE users.id = $1 AND category = $2 AND active = true ORDER BY tasks.last_modified DESC;';
        let eatArr = [];
        let buyArr = [];
        let readArr = [];
        let watchArr = [];
        const eat = db.query(categoryQueryString, [userID, categories[0]])
          .then(res => eatArr = res.rows);
        const buy = db.query(categoryQueryString, [userID, categories[1]])
          .then(res => buyArr = res.rows);
        const read = db.query(categoryQueryString, [userID, categories[2]])
          .then(res => readArr = res.rows);
        const watch = db.query(categoryQueryString, [userID, categories[3]])
          .then(res => watchArr = res.rows);

        Promise.all([eat, buy, read, watch]).then(() => {
          const templateVars = {
            user: user.rows[0],
            eats: eatArr,
            buys: buyArr,
            reads: readArr,
            watches: watchArr
          };
          res.render('index', templateVars);
        }).catch(err => {
          res
            .status(500)
            .json({ error: err.message });
        });
      })
      .catch(e => {
        console.error(e);
        res.send(e);
      });
  } else {
    console.log("Route for GET/ w no user=", userID);
    res.render("index", {user: undefined});
  }
});

app.get("/login/:user_id", (req, res) => {
  let queryStr = `SELECT id FROM users WHERE id=$1;
  `;
  console.log("Start of GET/login any", req.session.userID);

  db.query(queryStr, [req.params.user_id])
    .then(user => {
      if (user.rows[0] === undefined) {
        res.redirect('/', {user: undefined});
      }
      req.session.userID = user.rows[0]["id"];
      console.log("Logged in for", req.session.userID);
      res.redirect('/');
    })
    .catch(e => {
      console.error(e);
      res.send(e);
    });
});

app.get("/logout", (req, res) => {
  console.log("Logout");
  req.session = null;
  res.redirect('/');
});

app.get("/:user_id", (req, res) => {
  if (req.session.userID) {
    let queryStr = `SELECT id, full_name FROM users WHERE id=$1;
    `;
    console.log("Route for GET/:user_id w user=", req.session.userID);
    db.query(queryStr, [req.session.userID])
      .then(user => {
        console.log("Index 1st .then", user.rows[0]);
        res.render("index", {user: user.rows[0]});
      })
      .catch(e => {
        console.error(e);
        res.send(e);
      });
  } else {
    console.log("Route for GET/:user_id w no user=", req.session.userID);
    res.render("index", {user: undefined});
  }
});

// app.get("/:user_id", (req, res) => {
//   res.render("index");
// });

app.get("/:user_id/:list", (req, res) => {
  if (req.session.userID) {
    let queryStr = `SELECT id, full_name FROM users WHERE id=$1;
    `;
    console.log("Route for GET/:user_id/:list w user=", req.session.userID);
    db.query(queryStr, [req.session.userID])
      .then(user => {
        console.log("Index 1st .then", user.rows[0]);
        res.render("index", {user: user.rows[0]});
      })
      .catch(e => {
        console.error(e);
        res.send(e);
      });
  } else {
    console.log("Route for GET/:user_id/:list w no user=", req.session.userID);
    res.render("index", {user: undefined});
  }
});

/* start of POST queries */
app.post("/:user_id/:task/:category", (req, res) => {
  if (!req.session.userID) {
    res.redirect('/');
  }

  console.log("PUT a task into different category");

  let queryStr = `UPDATE tasks SET category = $1 WHERE user_id=$2 AND category=$3 RETURNING *;
  `;
  db.query(queryStr, [req.body["new-category"],req.session.userID, req.params.category])
    .then(result => {
      if (result.rows[0] === undefined) {
        // delete not successful
      }
    })
    .catch(e => res.send(e));
});

app.post("/:user_id/:task", (req, res) => {
  if (!req.session.userID) {
    res.redirect('/');
  }
  console.log("Edit task");
  let queryStr = `UPDATE tasks SET description = $1 WHERE user_id=$2 AND id=$3 RETURNING *;
  `;
  db.query(queryStr, [req.body["new-description"], req.session.userID, req.params.task])
    .then(result => {
      if (result.rows[0] === undefined) {
        // delete not successful
      }
    })
    .catch(e => res.send(e));
});

/* temporary put the edit as a GET for testing */
app.post("/:user_id", (req, res) => {
  console.log("Edit user", req.session.userID);

  if (!req.session.userID) {
    console.log("No user?", req.session.userID);
    res.redirect('/');
  }

  const password = '$2a$10$FB/BOAVhpuLvpOREQVmvmezD4ED/.JBIDRh70tGevYzYzQgFId2u.';
  const new_name = 'Nathasa Romanova';
  const new_email = 'black.widow@avengers.org';
  let queryStr = `UPDATE users SET full_name = $1, email = $2, password = $3 WHERE id=$4 RETURNING *;
  `;
  // db.query(queryStr, [req.body["new_name"], req.body["new_email"], password, req.session.userID])
  db.query(queryStr, [new_name, new_email, password, req.session.userID])
    .then(result => {
      res.redirect('/');
    })
    .catch(e => res.send(e));
});

/* Start of PUT queries */
/* PUT query add new tasks to a user's list(s) */
app.put("/user_id/add-task", (req, res) => {
  const created_at = new Date(Date.now());
  let queryStr = `SELECT id FROM users WHERE id=$1;
  `;
  console.log("Start of GET/login", req.session.userID);

  db.query(queryStr, [req.session.userID])
    .then(user => {
      //Check if user exists in database before adding
      if (user.rows[0] === undefined) {
        console.log("Before insert to user", user.rows[0]);
        const insertStr = `INSERT INTO users (full_name, email, created_at, password)
          VALUES (NULL, NULL, $1, NULL)
          RETURNING *;
          `;
        return db.query(insertStr,[created_at.toUTCString()]);
      } else {
        return user;
      }
    })
    .catch(e => {
      console.warn("Unsuccessful add user");
      console.error(e);
      res.send(e);
      throw e;
    })
    .then(user => {
      const category = 'eat';
      const insertStr = `INSERT INTO tasks (user_id, last_modified, description, category)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
        `;
      console.log("Before add SQL:", user.rows[0]["id"], created_at.toUTCString(), req.body["task"], category);

      return db.query(insertStr, [user.rows[0]["id"], created_at.toUTCString(), req.body["task"], category]);
    })
    .then(task => {
      req.session.userID = task.rows[0]["user_id"];
      console.log("1st .then of insert = added task okay", task.rows[0]["user_id"], "vs userID:", req.session.userID);
      return db.query(`SELECT * FROM tasks WHERE user_id = $1;`, [task.rows[0]["user_id"]]);
    })
    .then(tasks => {
      console.log("2nd .then of insert to return list of items", tasks.rows);
      res.redirect("/");
    })
    .catch(e => {
      console.warn("Unsuccessful add task");
      console.error(e);
      res.send(e);
    });
});

app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`);
});
