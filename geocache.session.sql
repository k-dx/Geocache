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
    FOREIGN KEY (owner_id) REFERENCES Users(id)
)

-- @block
CREATE TABLE Waypoints(
    id INT PRIMARY KEY AUTO_INCREMENT,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    route_id INT,
    order_id INT NOT NULL,
    name VARCHAR(255) NOT NULL
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

-- @block
SELECT * FROM Waypoints;

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
ADD COLUMN name VARCHAR(255) NOT NULL;

-- @block
ALTER TABLE Users
ADD CONSTRAINT chk_password_or_googleId CHECK (password IS NOT NULL OR googleId IS NOT NULL);

-- @block
ALTER TABLE Users
MODIFY password VARCHAR(255) NULL;

-- @block
DELETE FROM Waypoints WHERE route_id = 2