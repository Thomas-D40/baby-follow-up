package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.BabyResponse;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.BabyService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import java.util.List;
import java.util.UUID;

/**
 * Access to the current user's babies (US1.5 — isolation). Systematic filtering through the
 * service layer. Unlinked resource → <strong>404</strong>; no session → 401.
 *
 * <p><em>Existing</em> isolation surface in Epic 1 (read). IDOR on events is re-tested in each
 * epic 2→7 (no event endpoint here).
 */
@Path("/api/babies")
@Authenticated
public class BabyController {

    @Inject
    CurrentUser currentUser;

    @Inject
    BabyService babies;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public List<BabyResponse> myBabies() {
        AppUser me = currentUser.require();
        return babies.babiesOf(me.id);
    }

    @GET
    @Path("/{babyId}")
    @Produces(MediaType.APPLICATION_JSON)
    public BabyResponse getBaby(@PathParam("babyId") UUID babyId) {
        AppUser me = currentUser.require();
        return babies.getForUser(me.id, babyId);
    }
}
