
DROP USER IF EXISTS ''@'%';


DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';

FLUSH PRIVILEGES;