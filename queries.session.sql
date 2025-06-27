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

-- @block
SELECT w.name, w.latitude, w.longitude, visits
FROM LeaderboardWaypointsWithMostVisits lw
JOIN Waypoints w ON lw.waypoint_id = w.id
ORDER BY visits DESC;

-- @block
SELECT u.username, l.visits
FROM LeaderboardUsersWithMostVisits l
JOIN Users u ON l.user_id = u.id
ORDER BY visits DESC
LIMIT 10;