const express = require("express");

const app = express();
app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const path = require("path");

const bcrypt = require("bcrypt");
const jsonwebtoken = require("jsonwebtoken");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error:${e.message}`);
  }
};

initializeDBAndServer();

const convertDBObjectToStateObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDBObjectTODistrictObject = (dbObject) => {
  return {
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

const authenticateWebToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jsonwebtoken.verify(jwtToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const isUserPresent = `
    select 
    * 
    from
    user
    where
    username='${username}';
    `;
  const userPresent = await db.get(isUserPresent);
  if (userPresent !== undefined) {
    const isPasswordMatched = await bcrypt.compare(
      password,
      userPresent.password
    );
    if (isPasswordMatched === true) {
      let jwtToken;
      const payload = { username: username };
      jwtToken = await jsonwebtoken.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    } else if (isPasswordMatched === false) {
      response.status(400);
      response.send("Invalid password");
    }
  } else if (userPresent === undefined) {
    response.status(400);
    response.send("Invalid user");
  }
});

//API 2
app.get("/states", authenticateWebToken, async (request, response) => {
  const getAllStates = `
    select
    *
    from state;
    `;
  const states = await db.all(getAllStates);
  response.send(states.map((state) => convertDBObjectToStateObject(state)));
});

//API 3

app.get(
  "/states/:stateId/",
  authenticateWebToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getState = `
  select
  *
  from
  state
  where
  state_id=${stateId};
  `;
    const state = await db.get(getState);
    response.send(convertDBObjectToStateObject(state));
  }
);

//API 4
app.post("/districts/", authenticateWebToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const addDistrict = `
    insert into
    district(district_name,state_id,cases,cured,active,deaths)
    values(
       '${districtName}',
        ${stateId},
        ${cases},
        ${cured},
        ${active},
        ${deaths}
    );
    `;
  await db.run(addDistrict);
  response.send("District Successfully Added");
});

//API 5

app.get(
  "/districts/:districtId/",
  authenticateWebToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrict = `
    select
    *
    from
    district
    where
    district_id=${districtId};
    `;

    const district = await db.get(getDistrict);
    response.send({
      districtId: district.district_id,
      districtName: district.district_name,
      stateId: district.state_id,
      cases: district.cases,
      cured: district.cured,
      active: district.active,
      deaths: district.deaths,
    });
  }
);

//API 6

app.delete(
  "/districts/:districtId/",
  authenticateWebToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrict = `
    delete
    from
    district
    where
    district_id=${districtId};
    `;
    await db.run(deleteDistrict);
    response.send("District Removed");
  }
);

//API 7
app.put(
  "/districts/:districtId/",
  authenticateWebToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrict = `
    update
    district
    set
    district_name='${districtName}',
    state_id=${stateId},
    cases=${cases},
    cured=${cured},
    active=${active},
    deaths=${deaths}
    where district_id=${districtId}
    `;
    await db.run(updateDistrict);
    response.send("District Details Updated");
  }
);

// API 8
app.get(
  "/states/:stateId/stats/",
  authenticateWebToken,
  async (request, response) => {
    const { stateId } = request.params;
    const statsQuery = `
    select
   sum(cases),
    sum(cured),
    sum(active),
    sum(deaths)
    from
    district
    where
     state_id=${stateId};
    `;

    const statsResult = await db.get(statsQuery);

    response.send({
      totalCases: statsResult["sum(cases)"],
      totalCured: statsResult["sum(cured)"],
      totalActive: statsResult["sum(active)"],
      totalDeaths: statsResult["sum(deaths)"],
    });
  }
);

module.exports = app;
