idf_component_register(
    SRCS "entity_serialization.c"
    INCLUDE_DIRS "include"
    REQUIRES model
    PRIV_REQUIRES cbor
)
