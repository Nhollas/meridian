FROM quay.io/keycloak/keycloak:26.5.3 AS builder

ENV KC_HEALTH_ENABLED=true \
    KC_HTTP_MANAGEMENT_HEALTH_ENABLED=false \
    KC_LEGACY_OBSERVABILITY_INTERFACE=true \
    KC_DB=dev-mem

COPY keycloak/realm-import.json /opt/keycloak/data/import/realm-import.json

RUN /opt/keycloak/bin/kc.sh build \
    --health-enabled=true \
    --http-management-health-enabled=false \
    --legacy-observability-interface=true \
    --db=dev-mem

FROM quay.io/keycloak/keycloak:26.5.3

ENV KC_HEALTH_ENABLED=true \
    KC_HTTP_MANAGEMENT_HEALTH_ENABLED=false \
    KC_LEGACY_OBSERVABILITY_INTERFACE=true \
    KC_DB=dev-mem \
    KC_HTTP_ENABLED=true \
    KC_PROXY_HEADERS=xforwarded \
    KC_HOSTNAME_STRICT=false

COPY --from=builder /opt/keycloak/ /opt/keycloak/

# Keycloak serves login/admin theme assets through a gzip cache rooted under
# /opt/keycloak/data/tmp. Point that path at the existing writable /dev/shm
# mount so it still works when the container root filesystem is read-only.
RUN rm -rf /opt/keycloak/data/tmp && ln -s /dev/shm /opt/keycloak/data/tmp

EXPOSE 8080

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized", "--import-realm"]
