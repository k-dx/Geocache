# Geocache

Geocache is a real-life game about exploring places. Anyone can create a route consisting of waypoints on a map. The author of the route prints QR-Codes and places them physically at location of each respective waypoint. Others can join the route here in the app and their goal is to visit all waypoints in the route by scanning the QR-Codes at the location of each waypoint. The author of the route can see who visited which waypoints in his route.

### Running
1. `npm install`
2. Create tables from `geocache2.session.sql` in MySQL db. (see next section)
3. Fill `.env.template` and put into `.env` (`GOOGLE_*` fields are not necessary for development)
4. `npm start` for production or `npm run dev` for dev build (you might need to `npm install -g nodemon` before `npm run dev`)

### Creating the mysql database (locally in docker)

1. `cd Geocache`
2. `docker compose up`
    1. If you can't connect try uncommenting `expose` and `ports` sections in `compose.yaml`
3. `$ sudo mysql -h 127.0.0.1 -P 3306 -u root -p`
    1. Try again if unsuccessful
4. `mysql> CREATE DATABASE geocache;`
5. `mysql> USE GEOCACHE;`
6. `mysql> source geocache2.session.sql` (or create tables by pasting commands from `geocache2.session.sql`)
7. (fix for permissions) `mysql> ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'password';`

### Technologies used:
* NodeJS + ExpressJS with EJS template engine
* MySQL database via `mysql2`
* Google Maps Javascript API
* OAuth2 (Google Accounts)
* TailwindCSS with Flowbite component library
* Docker(file)

### Deployment (Google Cloud)

Services used:
* Cloud Run
* Cloud SQL
* Secrets Manager

See [deploy.md](./deploy.md) for details. I don't keep an instance up as Cloud SQL in not cheap.