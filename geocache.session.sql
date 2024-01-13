-- @block
CREATE TABLE Users(
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(255) NOT NULL,
    email NVARCHAR(255) NOT NULL,
    password VARCHAR(255),
    googleId VARCHAR(255),
    CHECK (password IS NOT NULL OR googleId IS NOT NULL)
)

-- @block
CREATE TABLE Routes(
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    owner_id INT,
    FOREIGN KEY (owner_id) 
        REFERENCES Users(id)
        ON DELETE CASCADE
)

-- @block
CREATE TABLE Waypoints(
    id INT PRIMARY KEY AUTO_INCREMENT,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    route_id INT,
    order_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    uuid VARCHAR(512),
    FOREIGN KEY (route_id) 
        REFERENCES Routes(id)
        ON DELETE CASCADE
)

-- @block
CREATE TABLE JoinedRoutes(
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    route_id INT NOT NULL,
    FOREIGN KEY (user_id) 
        REFERENCES Users(id)
        ON DELETE CASCADE,
    FOREIGN KEY (route_id) 
        REFERENCES Routes(id)
        ON DELETE CASCADE,
    UNIQUE(user_id, route_id)
)

-- @block
CREATE TABLE Visits(
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    waypoint_id INT NOT NULL,
    FOREIGN KEY (user_id) 
        REFERENCES Users(id)
        ON DELETE CASCADE,
    FOREIGN KEY (waypoint_id)
        REFERENCES Waypoints(id)
        ON DELETE CASCADE,
    UNIQUE(user_id, waypoint_id)
)


-- @block
SELECT * FROM Routes 
LEFT JOIN JoinedRoutes ON Routes.id = JoinedRoutes.route_id
WHERE JoinedRoutes.user_id = 10 OR JoinedRoutes.user_id IS NULL

-- @block
SELECT 
    Routes.id,
    Routes.name,
    CASE 
        WHEN JoinedRoutes.user_id IS NULL THEN 'No'
        ELSE 'Yes'
    END AS has_joined
FROM Routes
LEFT JOIN JoinedRoutes ON Routes.id = JoinedRoutes.route_id AND JoinedRoutes.user_id = 13;

-- @block
SELECT MAX(id) FROM Routes

-- @block
INSERT INTO Users (username, email, password) VALUES ('kdx', 'kdx@email.com', 'abc123')

-- @block
SELECT * FROM Users;

-- @block
SELECT * FROM Routes;

-- @block
SELECT * FROM Waypoints;

-- @block
SELECT * FROM Visits;

-- @block
SELECT * FROM JoinedRoutes

-- @block
UPDATE Routes SET name = 'placeholder' WHERE id = 1 AND owner_id = 1

-- @block
ALTER TABLE Users
ADD username VARCHAR(255) NOT NULL;

-- @block
SELECT * FROM Users WHERE username = 'john123'

-- @block
DELETE FROM Users WHERE id BETWEEN 1 AND 4

-- @block
ALTER TABLE Waypoints
RENAME COLUMN visit_link TO uuid;

-- @block
ALTER TABLE Users
ADD CONSTRAINT chk_password_or_googleId CHECK (password IS NOT NULL OR googleId IS NOT NULL);

-- @block
ALTER TABLE Users
MODIFY password VARCHAR(255) NULL;

-- @block
DELETE FROM Waypoints WHERE route_id = 2

-- @block
DROP TABLE JoinedRoutes;

-- @block
SELECT *
FROM Routes LEFT JOIN JoinedRoutes ON Routes.id = JoinedRoutes.route_id
WHERE JoinedRoutes.user_id = 1 OR JoinedRoutes.user_id IS NULL

-- @block
SELECT *
FROM Routes LEFT JOIN JoinedRoutes ON Routes.id = JoinedRoutes.route_id

-- @block
SELECT Routes.id AS route_id, Routes.name, JoinedRoutes.user_id
    FROM Routes
    LEFT JOIN JoinedRoutes ON Routes.id = JoinedRoutes.route_id
    WHERE (JoinedRoutes.user_id = 1 OR JoinedRoutes.user_id IS NULL)

-- @block
SELECT Users.id as user_id, Users.*, JoinedRoutes.*, Visits.* FROM
    Users JOIN JoinedRoutes ON Users.id = JoinedRoutes.user_id
    LEFT JOIN Visits on Users.id = Visits.user_id
    WHERE JoinedRoutes.route_id = 6

-- @block
SELECT * FROM Routes WHERE owner_id = 6 AND name LIKE '%%'