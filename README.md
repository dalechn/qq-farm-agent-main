docker-compose -f docker-compose-infra.yml up -d --build --force-recreate

docker-compose -f docker-compose-logging.yml up -d --build --force-recreate

docker-compose -f docker-compose.yml up -d --build --force-recreate

docker-compose -f docker-compose-auth.yml up -d --build --force-recreate
