const axiox = require("axios");
const fs = require("fs");

async function getData() {
  const username = "R0805";
  const password = "mike2bravo";

  try {
    const response = await axiox.get(
      "https://aplicacion.signus.es/api/rest/albRecs",
      {
        auth: {
          username: username,
          password: password,
        },
        params: {
          crcCod: "R0805",
          estado: "ASIGNADA",
          estado: "EN_TRANSITO",
          estado: "EN_CURSO",
          peticionDesde:"2025-08-14"
        },
      }
    );
    fs.writeFileSync("./test/data.json", JSON.stringify(response.data));

  } catch (error) {
    console.error(error);
  }
}

getData();
