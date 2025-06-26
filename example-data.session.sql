-- @block
INSERT INTO Achievements (name, description, icon)
VALUES ('Joining a route', 'Awarded for joining your first route.', '/assets/achievements/join-a-route.png');
INSERT INTO Achievements (name, description, icon)
VALUES ('Create a route', 'Awarded for creating your first route.', '/assets/achievements/create-a-route.png');

-- @block
INSERT INTO UserAchievements (user_id, achievement_id)
VALUES (2, 1);