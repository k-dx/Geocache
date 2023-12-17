-- @block
CREATE TABLE Users(
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(255) NOT NULL,
    email NVARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL
)

-- @block
CREATE TABLE Routes(
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    owner_id INT,
    FOREIGN KEY (owner_id) REFERENCES Users(id)
)

-- @block
CREATE TABLE Waypoints(
    id INT PRIMARY KEY AUTO_INCREMENT,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    route_id INT,
    FOREIGN KEY (route_id) REFERENCES Routes(id)
)

-- @block
SELECT MAX(id) FROM Routes

-- @block
INSERT INTO Users (username, email, password) VALUES ('kdx', 'kdx@email.com', 'abc123')

-- @block
SELECT * FROM Users;

-- @block
SELECT * FROM Routes;